//! RSQL filter expressions compiled to parameterized SQL.
//!
//! The port of `apps/api/src/lib/rsql.ts`, which uses `@rsql/parser` plus
//! Drizzle. Grammar (<https://github.com/jirutka/rsql-parser>):
//!
//! ```text
//! or          := and (("," | "or") and)*
//! and         := primary ((";" | "and") primary)*
//! primary     := "(" or ")" | comparison
//! comparison  := selector operator value
//! operator    := "==" | "!=" | "<" | "<=" | ">" | ">=" | "=lt=" | "=le="
//!              | "=gt=" | "=ge=" | "=in=" | "=out="
//! value       := single | "(" single ("," single)* ")"
//! ```
//!
//! Selectors are looked up in a per-endpoint allowlist ([`FieldMap`]), so a
//! filter can never reach a column — or a table — that the endpoint did not
//! deliberately expose. Values are always bound, never interpolated.
//!
//! Two places where the dialects genuinely differ, both handled here:
//!
//! - **Wildcards.** Postgres has `ILIKE`; SQLite's `LIKE` is already
//!   case-insensitive for ASCII. More subtly, Postgres' `LIKE` treats `\` as
//!   an escape by default and SQLite's does not, so `ESCAPE '\'` is stated
//!   explicitly — without it, the escaping of a literal `%` silently stops
//!   working on SQLite.
//! - **Array columns.** `artists.genres` is `text[]` on Postgres and a JSON
//!   array on SQLite, so containment is `@>` / `&&` against one and
//!   `json_each` against the other.

use crate::query::{Arg, Sql};
use crate::Dialect;
use sea_query::extension::postgres::PgExpr;
use sea_query::{Alias, Expr, SimpleExpr};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FieldType {
    String,
    Number,
    Date,
    /// A `text[]` (Postgres) / JSON array (SQLite) column.
    StringArray,
}

/// A selector's target column and how its values coerce.
#[derive(Debug, Clone, Copy)]
pub struct Field {
    /// Fully-qualified column, e.g. `"tracks.title"` or `"s.timestamp"`.
    pub column: &'static str,
    pub kind: FieldType,
}

impl Field {
    pub const fn text(column: &'static str) -> Self {
        Self {
            column,
            kind: FieldType::String,
        }
    }

    pub const fn number(column: &'static str) -> Self {
        Self {
            column,
            kind: FieldType::Number,
        }
    }

    pub const fn date(column: &'static str) -> Self {
        Self {
            column,
            kind: FieldType::Date,
        }
    }

    pub const fn array(column: &'static str) -> Self {
        Self {
            column,
            kind: FieldType::StringArray,
        }
    }
}

/// The selectors one endpoint exposes. A slice rather than a map so it can be
/// a `const`; these have at most a couple of dozen entries, so the linear
/// lookup is not worth a hash.
pub type FieldMap = &'static [(&'static str, Field)];

fn lookup(fields: FieldMap, selector: &str) -> Option<Field> {
    fields
        .iter()
        .find(|(name, _)| *name == selector)
        .map(|(_, field)| *field)
}

#[derive(Debug, thiserror::Error)]
#[error("{0}")]
pub struct RsqlError(String);

type Result<T> = std::result::Result<T, RsqlError>;

// ------------------------------------------------------------------ tokens

#[derive(Debug, Clone, PartialEq)]
enum Token {
    LParen,
    RParen,
    Comma,
    Semi,
    /// A comparison operator, normalized to its symbolic form.
    Op(String),
    /// An unquoted token: a selector, a value, or the words `and` / `or`.
    Bare(String),
    /// A quoted value, with escapes already resolved.
    Quoted(String),
}

/// Characters RSQL reserves, which therefore cannot appear in a bare token.
const RESERVED: &[char] = &['"', '\'', '(', ')', ';', ',', '=', '<', '>', '!', '~'];

fn tokenize(input: &str) -> Result<Vec<Token>> {
    let chars: Vec<char> = input.chars().collect();
    let mut tokens = Vec::new();
    let mut i = 0;

    while i < chars.len() {
        let ch = chars[i];

        if ch.is_whitespace() {
            i += 1;
            continue;
        }

        match ch {
            '(' => {
                tokens.push(Token::LParen);
                i += 1;
            }
            ')' => {
                tokens.push(Token::RParen);
                i += 1;
            }
            ',' => {
                tokens.push(Token::Comma);
                i += 1;
            }
            ';' => {
                tokens.push(Token::Semi);
                i += 1;
            }
            '"' | '\'' => {
                let (value, next) = read_quoted(&chars, i)?;
                tokens.push(Token::Quoted(value));
                i = next;
            }
            '=' | '!' | '<' | '>' => {
                let (op, next) = read_operator(&chars, i)?;
                tokens.push(Token::Op(op));
                i = next;
            }
            _ => {
                let start = i;
                while i < chars.len() && !chars[i].is_whitespace() && !RESERVED.contains(&chars[i])
                {
                    i += 1;
                }
                tokens.push(Token::Bare(chars[start..i].iter().collect()));
            }
        }
    }

    Ok(tokens)
}

fn read_quoted(chars: &[char], start: usize) -> Result<(String, usize)> {
    let quote = chars[start];
    let mut value = String::new();
    let mut i = start + 1;

    while i < chars.len() {
        match chars[i] {
            '\\' if i + 1 < chars.len() => {
                value.push(chars[i + 1]);
                i += 2;
            }
            ch if ch == quote => return Ok((value, i + 1)),
            ch => {
                value.push(ch);
                i += 1;
            }
        }
    }

    Err(RsqlError(
        "Invalid RSQL filter: unterminated quoted value".into(),
    ))
}

fn read_operator(chars: &[char], start: usize) -> Result<(String, usize)> {
    let two: String = chars[start..(start + 2).min(chars.len())].iter().collect();

    // `=name=` verbose form, e.g. `=gt=`, `=in=`.
    if chars[start] == '=' && chars.get(start + 1).is_some_and(|c| c.is_alphanumeric()) {
        let mut i = start + 1;
        while i < chars.len() && chars[i].is_alphanumeric() {
            i += 1;
        }
        if chars.get(i) != Some(&'=') {
            return Err(RsqlError(format!(
                "Invalid RSQL filter: malformed operator near {:?}",
                chars[start..i.min(chars.len())].iter().collect::<String>()
            )));
        }
        let name: String = chars[start + 1..i].iter().collect();
        let symbolic = match name.to_ascii_lowercase().as_str() {
            "lt" => "<",
            "le" => "<=",
            "gt" => ">",
            "ge" => ">=",
            "eq" => "==",
            "ne" => "!=",
            "in" => "=in=",
            "out" => "=out=",
            other => {
                return Err(RsqlError(format!(
                    "Unsupported filter operator \"={other}=\""
                )))
            }
        };
        return Ok((symbolic.to_string(), i + 1));
    }

    match two.as_str() {
        "==" | "!=" | "<=" | ">=" => Ok((two, start + 2)),
        _ => match chars[start] {
            '<' => Ok(("<".into(), start + 1)),
            '>' => Ok((">".into(), start + 1)),
            other => Err(RsqlError(format!(
                "Invalid RSQL filter: unexpected {other:?}"
            ))),
        },
    }
}

// --------------------------------------------------------------------- ast

#[derive(Debug, Clone, PartialEq)]
enum Node {
    And(Box<Node>, Box<Node>),
    Or(Box<Node>, Box<Node>),
    Compare {
        selector: String,
        operator: String,
        values: Vec<String>,
    },
}

struct Parser {
    tokens: Vec<Token>,
    position: usize,
}

impl Parser {
    fn peek(&self) -> Option<&Token> {
        self.tokens.get(self.position)
    }

    fn next(&mut self) -> Option<Token> {
        let token = self.tokens.get(self.position).cloned();
        if token.is_some() {
            self.position += 1;
        }
        token
    }

    /// Whether the cursor is on the verbose `and` / `or` combinator.
    fn at_word(&self, word: &str) -> bool {
        matches!(self.peek(), Some(Token::Bare(value)) if value.eq_ignore_ascii_case(word))
    }

    fn parse_or(&mut self) -> Result<Node> {
        let mut left = self.parse_and()?;
        loop {
            if matches!(self.peek(), Some(Token::Comma)) {
                self.next();
            } else if self.at_word("or") {
                self.next();
            } else {
                return Ok(left);
            }
            let right = self.parse_and()?;
            left = Node::Or(Box::new(left), Box::new(right));
        }
    }

    fn parse_and(&mut self) -> Result<Node> {
        let mut left = self.parse_primary()?;
        loop {
            if matches!(self.peek(), Some(Token::Semi)) {
                self.next();
            } else if self.at_word("and") {
                self.next();
            } else {
                return Ok(left);
            }
            let right = self.parse_primary()?;
            left = Node::And(Box::new(left), Box::new(right));
        }
    }

    fn parse_primary(&mut self) -> Result<Node> {
        if matches!(self.peek(), Some(Token::LParen)) {
            // A `(` here opens a group. A `(` in value position is handled by
            // parse_comparison, which is the only other place one can appear.
            self.next();
            let inner = self.parse_or()?;
            match self.next() {
                Some(Token::RParen) => Ok(inner),
                _ => Err(RsqlError(
                    "Invalid RSQL filter: missing closing parenthesis".into(),
                )),
            }
        } else {
            self.parse_comparison()
        }
    }

    fn parse_comparison(&mut self) -> Result<Node> {
        let selector = match self.next() {
            Some(Token::Bare(value)) => value,
            Some(Token::Quoted(value)) => value,
            other => {
                return Err(RsqlError(format!(
                    "Invalid RSQL filter: expected a field name, found {}",
                    describe(other.as_ref())
                )))
            }
        };

        let operator = match self.next() {
            Some(Token::Op(op)) => op,
            other => {
                return Err(RsqlError(format!(
                    "Invalid RSQL filter: expected an operator after \"{selector}\", found {}",
                    describe(other.as_ref())
                )))
            }
        };

        let values = self.parse_values(&selector)?;
        Ok(Node::Compare {
            selector,
            operator,
            values,
        })
    }

    fn parse_values(&mut self, selector: &str) -> Result<Vec<String>> {
        if matches!(self.peek(), Some(Token::LParen)) {
            self.next();
            let mut values = Vec::new();
            loop {
                match self.next() {
                    Some(Token::Bare(value)) | Some(Token::Quoted(value)) => values.push(value),
                    other => {
                        return Err(RsqlError(format!(
                            "Invalid RSQL filter: expected a value in the list for \
                             \"{selector}\", found {}",
                            describe(other.as_ref())
                        )))
                    }
                }
                match self.next() {
                    Some(Token::Comma) => continue,
                    Some(Token::RParen) => break,
                    other => {
                        return Err(RsqlError(format!(
                            "Invalid RSQL filter: expected \",\" or \")\" in the list for \
                             \"{selector}\", found {}",
                            describe(other.as_ref())
                        )))
                    }
                }
            }
            if values.is_empty() {
                return Err(RsqlError(format!(
                    "Invalid RSQL filter: empty value list for \"{selector}\""
                )));
            }
            Ok(values)
        } else {
            match self.next() {
                Some(Token::Bare(value)) | Some(Token::Quoted(value)) => Ok(vec![value]),
                other => Err(RsqlError(format!(
                    "Invalid RSQL filter: expected a value for \"{selector}\", found {}",
                    describe(other.as_ref())
                ))),
            }
        }
    }
}

fn describe(token: Option<&Token>) -> String {
    match token {
        None => "the end of the expression".into(),
        Some(Token::LParen) => "\"(\"".into(),
        Some(Token::RParen) => "\")\"".into(),
        Some(Token::Comma) => "\",\"".into(),
        Some(Token::Semi) => "\";\"".into(),
        Some(Token::Op(op)) => format!("\"{op}\""),
        Some(Token::Bare(value)) | Some(Token::Quoted(value)) => format!("\"{value}\""),
    }
}

fn parse(filter: &str) -> Result<Node> {
    let tokens = tokenize(filter)?;
    if tokens.is_empty() {
        return Err(RsqlError("Invalid RSQL filter: empty expression".into()));
    }
    let mut parser = Parser {
        tokens,
        position: 0,
    };
    let node = parser.parse_or()?;
    if parser.position != parser.tokens.len() {
        return Err(RsqlError(format!(
            "Invalid RSQL filter: unexpected {} after the expression",
            describe(parser.peek())
        )));
    }
    Ok(node)
}

// ----------------------------------------------------------------- compile

/// Compiles `filter` into a SQL condition over `fields`.
pub fn compile(filter: &str, fields: FieldMap, dialect: Dialect) -> Result<Sql> {
    let node = parse(filter)?;
    let mut sql = Sql::new(dialect, "");
    compile_node(&node, fields, &mut sql)?;
    Ok(sql)
}

/// Compiles an optional filter param, which is what handlers actually hold.
/// `None` and blank both mean "no condition".
pub fn compile_param(
    filter: Option<&str>,
    fields: FieldMap,
    dialect: Dialect,
) -> std::result::Result<Option<Sql>, RsqlError> {
    match filter.map(str::trim).filter(|f| !f.is_empty()) {
        None => Ok(None),
        Some(filter) => Ok(Some(compile(filter, fields, dialect)?)),
    }
}

fn compile_node(node: &Node, fields: FieldMap, sql: &mut Sql) -> Result<()> {
    match node {
        Node::And(left, right) => {
            sql.push("(");
            compile_node(left, fields, sql)?;
            sql.push(" AND ");
            compile_node(right, fields, sql)?;
            sql.push(")");
            Ok(())
        }
        Node::Or(left, right) => {
            sql.push("(");
            compile_node(left, fields, sql)?;
            sql.push(" OR ");
            compile_node(right, fields, sql)?;
            sql.push(")");
            Ok(())
        }
        Node::Compare {
            selector,
            operator,
            values,
        } => compile_comparison(selector, operator, values, fields, sql),
    }
}

fn compile_comparison(
    selector: &str,
    operator: &str,
    values: &[String],
    fields: FieldMap,
    sql: &mut Sql,
) -> Result<()> {
    let Some(field) = lookup(fields, selector) else {
        let mut allowed: Vec<&str> = fields.iter().map(|(name, _)| *name).collect();
        allowed.sort_unstable();
        return Err(RsqlError(format!(
            "Unknown filter field \"{selector}\". Allowed fields: {}",
            allowed.join(", ")
        )));
    };

    let single = || -> Result<&String> {
        values.first().ok_or_else(|| {
            RsqlError(format!(
                "Invalid RSQL filter: missing value for \"{selector}\""
            ))
        })
    };

    match operator {
        "==" => compile_equality(selector, field, single()?, false, sql),
        "!=" => compile_equality(selector, field, single()?, true, sql),
        "<" | "<=" | ">" | ">=" => {
            if field.kind == FieldType::StringArray {
                return Err(RsqlError(format!(
                    "Field \"{selector}\" is an array and only supports ==, !=, =in= and =out="
                )));
            }
            sql.push(field.column).push(" ").push(operator).push(" ");
            bind_coerced(selector, field, single()?, sql)
        }
        "=in=" | "=out=" => {
            let negated = operator == "=out=";
            if field.kind == FieldType::StringArray {
                return compile_array_overlap(field, values, negated, sql);
            }
            sql.push(field.column);
            sql.push(if negated { " NOT IN (" } else { " IN (" });
            for (index, value) in values.iter().enumerate() {
                if index > 0 {
                    sql.push(", ");
                }
                bind_coerced(selector, field, value, sql)?;
            }
            sql.push(")");
            Ok(())
        }
        other => Err(RsqlError(format!(
            "Unsupported filter operator \"{other}\" on field \"{selector}\""
        ))),
    }
}

fn compile_equality(
    selector: &str,
    field: Field,
    raw: &str,
    negated: bool,
    sql: &mut Sql,
) -> Result<()> {
    // The bare literal `null` means IS NULL, on every field type.
    if raw == "null" {
        sql.push(field.column);
        sql.push(if negated { " IS NOT NULL" } else { " IS NULL" });
        return Ok(());
    }

    if field.kind == FieldType::StringArray {
        return compile_array_contains(field, raw, negated, sql);
    }

    if field.kind == FieldType::String && raw.contains('*') {
        let pattern = like_pattern(raw);
        if negated {
            sql.push(field.column).push(" NOT ");
        } else {
            sql.push(field.column).push(" ");
        }
        // Postgres has a case-insensitive operator; SQLite's LIKE already is
        // (for ASCII), so plain LIKE is the equivalent there.
        sql.push(match sql.dialect() {
            Dialect::Postgres => "ILIKE ",
            Dialect::Sqlite => "LIKE ",
        });
        sql.bind(Arg::Text(pattern));
        // Stated explicitly because SQLite's LIKE has no default escape
        // character, so the backslashes added by like_pattern would otherwise
        // be matched literally there.
        sql.push(" ESCAPE '\\'");
        return Ok(());
    }

    sql.push(field.column);
    sql.push(if negated { " <> " } else { " = " });
    bind_coerced(selector, field, raw, sql)
}

/// `*` becomes `%`, and the LIKE metacharacters in the literal text are
/// escaped so a value containing `%` or `_` matches itself.
fn like_pattern(raw: &str) -> String {
    let mut pattern = String::with_capacity(raw.len() + 4);
    for ch in raw.chars() {
        match ch {
            '*' => pattern.push('%'),
            '\\' | '%' | '_' => {
                pattern.push('\\');
                pattern.push(ch);
            }
            other => pattern.push(other),
        }
    }
    pattern
}

fn compile_array_contains(field: Field, raw: &str, negated: bool, sql: &mut Sql) -> Result<()> {
    if negated {
        sql.push("NOT ");
    }
    match sql.dialect() {
        Dialect::Postgres => {
            sql.push("(").push(field.column).push(" @> ARRAY[");
            sql.bind(Arg::Text(raw.to_string()));
            sql.push("]::text[])");
        }
        Dialect::Sqlite => {
            // The column is a JSON array here, so containment is a lookup over
            // its elements.
            sql.push("EXISTS (SELECT 1 FROM json_each(")
                .push(field.column)
                .push(") WHERE json_each.value = ");
            sql.bind(Arg::Text(raw.to_string()));
            sql.push(")");
        }
    }
    Ok(())
}

fn compile_array_overlap(
    field: Field,
    values: &[String],
    negated: bool,
    sql: &mut Sql,
) -> Result<()> {
    if negated {
        sql.push("NOT ");
    }
    match sql.dialect() {
        Dialect::Postgres => {
            sql.push("(").push(field.column).push(" && ARRAY[");
            for (index, value) in values.iter().enumerate() {
                if index > 0 {
                    sql.push(", ");
                }
                sql.bind(Arg::Text(value.clone()));
            }
            sql.push("]::text[])");
        }
        Dialect::Sqlite => {
            sql.push("EXISTS (SELECT 1 FROM json_each(")
                .push(field.column)
                .push(") WHERE json_each.value IN ");
            sql.bind_list(values.iter().map(|value| value.as_str()));
            sql.push(")");
        }
    }
    Ok(())
}

/// Binds `raw` coerced to the field's type, rejecting values that do not fit.
fn bind_coerced(selector: &str, field: Field, raw: &str, sql: &mut Sql) -> Result<()> {
    match field.kind {
        FieldType::String => {
            sql.bind(Arg::Text(raw.to_string()));
            Ok(())
        }
        FieldType::Number => {
            let number: f64 = raw.parse().map_err(|_| {
                RsqlError(format!(
                    "Field \"{selector}\" expects a number, got \"{raw}\""
                ))
            })?;
            if !number.is_finite() {
                return Err(RsqlError(format!(
                    "Field \"{selector}\" expects a number, got \"{raw}\""
                )));
            }
            // Integral values bind as integers so comparisons against integer
            // columns do not go through a float.
            if number.fract() == 0.0 && number.abs() < i64::MAX as f64 {
                sql.bind(Arg::Int(number as i64));
            } else {
                sql.bind(Arg::Float(number));
            }
            Ok(())
        }
        FieldType::Date => {
            let parsed = parse_date(raw).ok_or_else(|| {
                RsqlError(format!(
                    "Field \"{selector}\" expects a date (e.g. 2025-01-01 or ISO datetime), \
                     got \"{raw}\""
                ))
            })?;
            sql.bind_timestamp(parsed);
            Ok(())
        }
        FieldType::StringArray => Err(RsqlError(format!(
            "Field \"{selector}\" is an array and only supports ==, !=, =in= and =out="
        ))),
    }
}

/// Accepts what `new Date(value)` accepts in the cases that matter: a full
/// RFC-3339 timestamp, a naive datetime (read as UTC), or a bare date.
fn parse_date(raw: &str) -> Option<chrono::DateTime<chrono::Utc>> {
    use chrono::{NaiveDate, NaiveDateTime, TimeZone, Utc};

    if let Ok(value) = chrono::DateTime::parse_from_rfc3339(raw) {
        return Some(value.with_timezone(&Utc));
    }
    for format in ["%Y-%m-%dT%H:%M:%S%.f", "%Y-%m-%d %H:%M:%S%.f"] {
        if let Ok(naive) = NaiveDateTime::parse_from_str(raw, format) {
            return Some(Utc.from_utc_datetime(&naive));
        }
    }
    if let Ok(date) = NaiveDate::parse_from_str(raw, "%Y-%m-%d") {
        return Some(Utc.from_utc_datetime(&date.and_hms_opt(0, 0, 0)?));
    }
    None
}

/// The selectors an expression references, so a handler can decide what a
/// filter needs before building the query — e.g. only joining `playlist_tracks`
/// when the caller actually filtered on track fields.
///
/// Returns `[]` for an absent or unparseable filter; reporting bad syntax is
/// [`compile`]'s job.
pub fn selectors(filter: Option<&str>) -> Vec<String> {
    let Some(filter) = filter.map(str::trim).filter(|f| !f.is_empty()) else {
        return Vec::new();
    };
    let Ok(node) = parse(filter) else {
        return Vec::new();
    };

    let mut found = Vec::new();
    collect_selectors(&node, &mut found);
    found
}

fn collect_selectors(node: &Node, out: &mut Vec<String>) {
    match node {
        Node::And(left, right) | Node::Or(left, right) => {
            collect_selectors(left, out);
            collect_selectors(right, out);
        }
        Node::Compare { selector, .. } => {
            if !out.iter().any(|existing| existing == selector) {
                out.push(selector.clone());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    pub(super) const FIELDS: FieldMap = &[
        ("title", Field::text("tracks.title")),
        ("artist", Field::text("tracks.artist")),
        ("uri", Field::text("tracks.uri")),
        ("genre", Field::text("tracks.genre")),
        ("duration", Field::number("tracks.duration")),
        ("createdAt", Field::date("tracks.xata_createdat")),
        ("genres", Field::array("artists.genres")),
    ];

    fn sqlite(filter: &str) -> Sql {
        compile(filter, FIELDS, Dialect::Sqlite).expect(filter)
    }

    fn postgres(filter: &str) -> Sql {
        compile(filter, FIELDS, Dialect::Postgres).expect(filter)
    }

    fn text(filter: &str) -> String {
        sqlite(filter).text().to_string()
    }

    fn args(filter: &str) -> Vec<Arg> {
        sqlite(filter).args().to_vec()
    }

    #[test]
    fn compiles_equality_to_a_parameterized_comparison() {
        assert_eq!(text(r#"title=="Discovery""#), "tracks.title = ?");
        assert_eq!(
            args(r#"title=="Discovery""#),
            vec![Arg::Text("Discovery".into())]
        );
    }

    #[test]
    fn compiles_inequality() {
        assert_eq!(text("artist!=Eminem"), "tracks.artist <> ?");
        assert_eq!(args("artist!=Eminem"), vec![Arg::Text("Eminem".into())]);
    }

    #[test]
    fn compiles_and_or_with_grouping() {
        let filter = "(genre==house,genre==electro);duration=gt=200000";
        let sql = sqlite(filter);
        assert!(sql.text().contains(" OR "), "{}", sql.text());
        assert!(sql.text().contains(" AND "), "{}", sql.text());
        assert_eq!(
            sql.args(),
            &[
                Arg::Text("house".into()),
                Arg::Text("electro".into()),
                Arg::Int(200_000),
            ]
        );
    }

    #[test]
    fn supports_verbose_and_or_combinators() {
        let sql = sqlite("genre==house or genre==electro");
        assert!(sql.text().contains(" OR "), "{}", sql.text());
        assert_eq!(
            sql.args(),
            &[Arg::Text("house".into()), Arg::Text("electro".into())]
        );

        let sql = sqlite("genre==house and duration=gt=1");
        assert!(sql.text().contains(" AND "), "{}", sql.text());
    }

    #[test]
    fn and_binds_tighter_than_or() {
        // a , b ; c  =>  a OR (b AND c)
        let sql = sqlite("genre==a,genre==b;genre==c");
        assert_eq!(
            sql.text(),
            "(tracks.genre = ? OR (tracks.genre = ? AND tracks.genre = ?))"
        );
    }

    #[test]
    fn translates_wildcards_to_case_insensitive_like() {
        let sql = sqlite("artist==Daft*");
        assert_eq!(sql.text(), "tracks.artist LIKE ? ESCAPE '\\'");
        assert_eq!(sql.args(), &[Arg::Text("Daft%".into())]);

        // Postgres needs the explicitly case-insensitive operator.
        let sql = postgres("artist==Daft*");
        assert!(sql.text().contains("ILIKE"), "{}", sql.text());
    }

    #[test]
    fn escapes_like_metacharacters_inside_wildcard_values() {
        // Without the ESCAPE clause above, these backslashes would be matched
        // literally on SQLite rather than escaping the % and _.
        assert_eq!(
            args(r#"artist=="*100%_*""#),
            vec![Arg::Text("%100\\%\\_%".into())]
        );
    }

    #[test]
    fn compiles_negated_wildcard_to_not_like() {
        let sql = sqlite("artist!=Daft*");
        assert_eq!(sql.text(), "tracks.artist NOT LIKE ? ESCAPE '\\'");
        assert_eq!(sql.args(), &[Arg::Text("Daft%".into())]);
    }

    #[test]
    fn compiles_in_and_out() {
        let sql = sqlite("genre=in=(house,electro)");
        assert_eq!(sql.text(), "tracks.genre IN (?, ?)");
        assert_eq!(
            sql.args(),
            &[Arg::Text("house".into()), Arg::Text("electro".into())]
        );

        let sql = sqlite("genre=out=(house,electro)");
        assert_eq!(sql.text(), "tracks.genre NOT IN (?, ?)");
    }

    #[test]
    fn compiles_ordered_comparisons_with_number_coercion() {
        let sql = sqlite("duration>=200000");
        assert_eq!(sql.text(), "tracks.duration >= ?");
        assert_eq!(sql.args(), &[Arg::Int(200_000)]);

        // The verbose spellings are the same operators.
        assert_eq!(text("duration=ge=1"), "tracks.duration >= ?");
        assert_eq!(text("duration=le=1"), "tracks.duration <= ?");
        assert_eq!(text("duration=lt=1"), "tracks.duration < ?");
        assert_eq!(text("duration=gt=1"), "tracks.duration > ?");
    }

    #[test]
    fn coerces_date_fields() {
        let sql = sqlite("createdAt=ge=2025-01-01");
        assert_eq!(
            sql.args(),
            &[Arg::Text("2025-01-01T00:00:00.000Z".into())],
            "a bare date is midnight UTC"
        );

        let sql = sqlite("createdAt=ge=2025-01-02T03:04:05Z");
        assert_eq!(sql.args(), &[Arg::Text("2025-01-02T03:04:05.000Z".into())]);

        // Postgres compares timestamptz, so the bound text needs its cast.
        let sql = postgres("createdAt=ge=2025-01-01");
        assert!(sql.text().ends_with("::timestamptz"), "{}", sql.text());
    }

    #[test]
    fn rejects_non_numeric_values_on_number_fields() {
        let err = compile("duration=gt=abc", FIELDS, Dialect::Sqlite).unwrap_err();
        assert!(err.to_string().contains("expects a number"), "{err}");
    }

    #[test]
    fn rejects_invalid_dates_on_date_fields() {
        let err = compile("createdAt=lt=not-a-date", FIELDS, Dialect::Sqlite).unwrap_err();
        assert!(err.to_string().contains("expects a date"), "{err}");
    }

    #[test]
    fn compiles_string_array_equality_to_containment() {
        let sql = postgres("genres==house");
        assert!(sql.text().contains("@>"), "{}", sql.text());
        assert_eq!(sql.args(), &[Arg::Text("house".into())]);

        let sql = sqlite("genres==house");
        assert!(sql.text().contains("json_each"), "{}", sql.text());
        assert_eq!(sql.args(), &[Arg::Text("house".into())]);
    }

    #[test]
    fn compiles_negated_string_array_equality() {
        for sql in [postgres("genres!=house"), sqlite("genres!=house")] {
            assert!(sql.text().starts_with("NOT "), "{}", sql.text());
        }
    }

    #[test]
    fn compiles_string_array_in_to_overlap() {
        let sql = postgres("genres=in=(house,electro)");
        assert!(sql.text().contains("&&"), "{}", sql.text());
        assert_eq!(
            sql.args(),
            &[Arg::Text("house".into()), Arg::Text("electro".into())]
        );

        let sql = sqlite("genres=in=(house,electro)");
        assert!(sql.text().contains("json_each"), "{}", sql.text());
        assert!(sql.text().contains("IN (?, ?)"), "{}", sql.text());
    }

    #[test]
    fn rejects_ordered_comparisons_on_string_array_fields() {
        let err = compile("genres=gt=house", FIELDS, Dialect::Sqlite).unwrap_err();
        assert!(err.to_string().contains("is an array"), "{err}");
    }

    #[test]
    fn compiles_null_equality_to_is_null() {
        assert_eq!(text("uri==null"), "tracks.uri IS NULL");
        assert_eq!(text("uri!=null"), "tracks.uri IS NOT NULL");
        assert!(args("uri==null").is_empty(), "IS NULL binds nothing");
    }

    #[test]
    fn rejects_unknown_fields_and_lists_the_allowed_ones() {
        let err = compile("password==hunter2", FIELDS, Dialect::Sqlite).unwrap_err();
        let message = err.to_string();
        assert!(
            message.contains(r#"Unknown filter field "password""#),
            "{message}"
        );
        assert!(message.contains("artist"), "{message}");
        assert!(message.contains("title"), "{message}");
        // Crucially, the value never reaches the database.
        assert!(!message.contains("hunter2"), "{message}");
    }

    #[test]
    fn rejects_malformed_expressions() {
        for filter in [
            "title==",
            "title",
            "==Discovery",
            "(title==a",
            "title==a)",
            "title==a;",
            r#"title=="unterminated"#,
            "duration=nope=1",
        ] {
            assert!(
                compile(filter, FIELDS, Dialect::Sqlite).is_err(),
                "{filter:?} should not compile"
            );
        }
    }

    #[test]
    fn quoted_values_may_contain_reserved_characters() {
        let sql = sqlite(r#"title=="Hello; (world), ok==""#);
        assert_eq!(sql.text(), "tracks.title = ?");
        assert_eq!(sql.args(), &[Arg::Text("Hello; (world), ok==".into())]);
    }

    #[test]
    fn escaped_quotes_inside_a_value_are_resolved() {
        let sql = sqlite(r#"title=="it\"s fine""#);
        assert_eq!(sql.args(), &[Arg::Text("it\"s fine".into())]);
    }

    #[test]
    fn compile_param_skips_absent_and_blank_filters() {
        assert!(compile_param(None, FIELDS, Dialect::Sqlite)
            .unwrap()
            .is_none());
        assert!(compile_param(Some(""), FIELDS, Dialect::Sqlite)
            .unwrap()
            .is_none());
        assert!(compile_param(Some("   "), FIELDS, Dialect::Sqlite)
            .unwrap()
            .is_none());
        assert!(compile_param(Some("title==a"), FIELDS, Dialect::Sqlite)
            .unwrap()
            .is_some());
    }

    #[test]
    fn selectors_collects_the_fields_of_a_compound_expression() {
        let mut found = selectors(Some(r#"title=="Road trip";artist=="Daft Punk""#));
        found.sort();
        assert_eq!(found, vec!["artist", "title"]);
    }

    #[test]
    fn selectors_deduplicates() {
        assert_eq!(
            selectors(Some("artist==Air,artist==Phoenix")),
            vec!["artist"]
        );
    }

    #[test]
    fn selectors_returns_nothing_for_absent_or_unparseable_filters() {
        assert!(selectors(None).is_empty());
        assert!(selectors(Some("  ")).is_empty());
        assert!(selectors(Some("title==")).is_empty());
    }

    /// Selector names are not column names: a filter naming a column directly
    /// must be rejected, or the allowlist would be pointless.
    #[test]
    fn column_names_are_not_valid_selectors() {
        assert!(compile("tracks.title==x", FIELDS, Dialect::Sqlite).is_err());
        assert!(compile("xata_id==x", FIELDS, Dialect::Sqlite).is_err());
    }
}

// --------------------------------------------------- sea-query expressions

/// The sea-query form of [`compile`].
///
/// Same grammar, same validation, same errors — it differs only in what it
/// produces: a [`SimpleExpr`] that composes into a sea-query statement with
/// `and_where`, rather than a SQL fragment that has to be spliced in by hand.
///
/// The dialect is still a parameter here because three cases genuinely differ
/// between backends: case-insensitive matching (`ILIKE` against `LIKE`), array
/// containment, and array overlap. It is not a parameter at the *call site*,
/// though — handlers reach this through [`crate::Backend::filter`], which
/// supplies it.
pub fn compile_expr(filter: &str, fields: FieldMap, dialect: Dialect) -> Result<SimpleExpr> {
    let node = parse(filter)?;
    expr_node(&node, fields, dialect)
}

/// Compiles an optional filter param. `None` and blank both mean "no
/// condition", which is a filter that was not supplied rather than one that
/// matches nothing.
pub fn compile_expr_param(
    filter: Option<&str>,
    fields: FieldMap,
    dialect: Dialect,
) -> std::result::Result<Option<SimpleExpr>, RsqlError> {
    match filter.map(str::trim).filter(|f| !f.is_empty()) {
        None => Ok(None),
        Some(filter) => Ok(Some(compile_expr(filter, fields, dialect)?)),
    }
}

/// A `table.column` string as a sea-query column reference.
///
/// The field maps spell columns the way the surrounding query aliases them
/// (`"t.album_artist"`), so the alias has to survive into the expression or
/// the condition would reference the wrong table in a join.
fn column(reference: &str) -> Expr {
    match reference.split_once('.') {
        Some((table, name)) => Expr::col((Alias::new(table), Alias::new(name))),
        None => Expr::col(Alias::new(reference)),
    }
}

fn expr_node(node: &Node, fields: FieldMap, dialect: Dialect) -> Result<SimpleExpr> {
    match node {
        Node::And(left, right) => {
            Ok(expr_node(left, fields, dialect)?.and(expr_node(right, fields, dialect)?))
        }
        Node::Or(left, right) => {
            Ok(expr_node(left, fields, dialect)?.or(expr_node(right, fields, dialect)?))
        }
        Node::Compare {
            selector,
            operator,
            values,
        } => expr_comparison(selector, operator, values, fields, dialect),
    }
}

fn expr_comparison(
    selector: &str,
    operator: &str,
    values: &[String],
    fields: FieldMap,
    dialect: Dialect,
) -> Result<SimpleExpr> {
    let Some(field) = lookup(fields, selector) else {
        let mut allowed: Vec<&str> = fields.iter().map(|(name, _)| *name).collect();
        allowed.sort_unstable();
        return Err(RsqlError(format!(
            "Unknown filter field \"{selector}\". Allowed fields: {}",
            allowed.join(", ")
        )));
    };

    let single = || -> Result<&String> {
        values.first().ok_or_else(|| {
            RsqlError(format!(
                "Invalid RSQL filter: missing value for \"{selector}\""
            ))
        })
    };

    match operator {
        "==" => expr_equality(selector, field, single()?, false, dialect),
        "!=" => expr_equality(selector, field, single()?, true, dialect),
        "<" | "<=" | ">" | ">=" => {
            if field.kind == FieldType::StringArray {
                return Err(RsqlError(format!(
                    "Field \"{selector}\" is an array and only supports ==, !=, =in= and =out="
                )));
            }
            let value = coerced(selector, field, single()?, dialect)?;
            let col = column(field.column);
            Ok(match operator {
                "<" => col.lt(value),
                "<=" => col.lte(value),
                ">" => col.gt(value),
                _ => col.gte(value),
            })
        }
        "=in=" | "=out=" => {
            let negated = operator == "=out=";
            if field.kind == FieldType::StringArray {
                return expr_array_overlap(field, values, negated, dialect);
            }
            let bound: Result<Vec<SimpleExpr>> = values
                .iter()
                .map(|value| coerced(selector, field, value, dialect))
                .collect();
            let bound = bound?;

            if bound.is_empty() {
                // Matches nothing, as `IN ()` does — and notably not a syntax
                // error, matching the legacy compiler and Drizzle's empty
                // `inArray`.
                let nothing = Expr::val(1).eq(0);
                return Ok(if negated { nothing.not() } else { nothing });
            }

            let col = column(field.column);
            match field.kind {
                // A date's expression carries a `::timestamptz` cast, and
                // sea-query's `is_in` takes bare values with nowhere to put
                // one. An OR chain of equalities is the same condition and
                // accepts an expression per arm.
                FieldType::Date => {
                    let mut chain: Option<SimpleExpr> = None;
                    for value in bound {
                        let equality = column(field.column).eq(value);
                        chain = Some(match chain {
                            None => equality,
                            Some(existing) => existing.or(equality),
                        });
                    }
                    let condition = chain.expect("the empty case returned above");
                    Ok(if negated { condition.not() } else { condition })
                }
                // Everything else renders as a real `IN`, which is both what
                // the query planner wants and what the compiler this replaces
                // emitted.
                _ => {
                    let plain: Vec<sea_query::Value> = values
                        .iter()
                        .map(|value| plain_value(selector, field, value))
                        .collect::<Result<_>>()?;
                    Ok(if negated {
                        col.is_not_in(plain)
                    } else {
                        col.is_in(plain)
                    })
                }
            }
        }
        other => Err(RsqlError(format!(
            "Unsupported filter operator \"{other}\" on field \"{selector}\""
        ))),
    }
}

fn expr_equality(
    selector: &str,
    field: Field,
    raw: &str,
    negated: bool,
    dialect: Dialect,
) -> Result<SimpleExpr> {
    // The bare literal `null` means IS NULL, on every field type.
    if raw == "null" {
        let col = column(field.column);
        return Ok(if negated {
            col.is_not_null()
        } else {
            col.is_null()
        });
    }

    if field.kind == FieldType::StringArray {
        return expr_array_contains(field, raw, negated, dialect);
    }

    if field.kind == FieldType::String && raw.contains('*') {
        let pattern = like_pattern(raw);
        // `ESCAPE '\'` is stated explicitly because SQLite's LIKE has no
        // default escape character, so the backslashes `like_pattern` adds
        // would otherwise be matched literally there.
        let like = sea_query::LikeExpr::new(pattern).escape('\\');
        let col = column(field.column);
        return Ok(match (dialect, negated) {
            // Postgres has a case-insensitive operator; SQLite's LIKE already
            // is, for ASCII, so plain LIKE is the equivalent there.
            (Dialect::Postgres, false) => col.ilike(like),
            (Dialect::Postgres, true) => col.not_ilike(like),
            (Dialect::Sqlite, false) => col.like(like),
            (Dialect::Sqlite, true) => col.not_like(like),
        });
    }

    let value = coerced(selector, field, raw, dialect)?;
    let col = column(field.column);
    Ok(if negated {
        col.ne(value)
    } else {
        col.eq(value)
    })
}

fn expr_array_contains(
    field: Field,
    raw: &str,
    negated: bool,
    dialect: Dialect,
) -> Result<SimpleExpr> {
    // Both forms are backend-specific operators sea-query has no builder for,
    // so they are written out and the value is still bound.
    let expr = match dialect {
        // `$1 = ANY(col)`, not `col @> ARRAY[$1]::text[]`. The second is the
        // more natural spelling and silently does not work: sea-query does not
        // substitute a `$N` marker inside `ARRAY[…]`, so the value was dropped
        // and the literal `$1` collided with the statement's own first
        // parameter — `filter=artist.genres==rock` then matched against
        // whatever that was. See `models::array_contains_expr`.
        Dialect::Postgres => {
            Expr::cust_with_values(format!("$1 = ANY({})", field.column), [raw.to_string()])
        }
        // The column is a JSON array here, so containment is a lookup over its
        // elements. `?` rather than `$1`: sea-query only substitutes the
        // numbered form for Postgres, and a literal `$1` would bind nothing.
        Dialect::Sqlite => Expr::cust_with_values(
            format!(
                "EXISTS (SELECT 1 FROM json_each({}) WHERE json_each.value = ?)",
                field.column
            ),
            [raw.to_string()],
        ),
    };
    Ok(if negated { expr.not() } else { expr })
}

fn expr_array_overlap(
    field: Field,
    values: &[String],
    negated: bool,
    dialect: Dialect,
) -> Result<SimpleExpr> {
    // Numbered for Postgres, positional for SQLite — sea-query substitutes
    // `$N` only for the former.
    let placeholders = match dialect {
        Dialect::Postgres => (1..=values.len().max(1))
            .map(|index| format!("${index}"))
            .collect::<Vec<_>>()
            .join(", "),
        Dialect::Sqlite => vec!["?"; values.len().max(1)].join(", "),
    };
    let bound: Vec<String> = values.to_vec();

    let expr = match dialect {
        // `unnest(col) … IN (…)` rather than `col && ARRAY[…]::text[]`, for
        // the reason in `expr_array_contains`: sea-query leaves a `$N` marker
        // inside `ARRAY[…]` unsubstituted, so the values were dropped and the
        // literal markers collided with the statement's real parameters. This
        // form mirrors the SQLite one below and keeps every marker bindable.
        Dialect::Postgres => Expr::cust_with_values(
            format!(
                "EXISTS (SELECT 1 FROM unnest({}) AS overlap_value \
                 WHERE overlap_value IN ({placeholders}))",
                field.column
            ),
            bound,
        ),
        Dialect::Sqlite => Expr::cust_with_values(
            format!(
                "EXISTS (SELECT 1 FROM json_each({}) WHERE json_each.value IN ({placeholders}))",
                field.column
            ),
            bound,
        ),
    };
    Ok(if negated { expr.not() } else { expr })
}

/// The same coercion as [`coerced`], as a bare value.
///
/// For `IN` lists, where sea-query wants values rather than expressions. Dates
/// do not come through here — they need a cast, which a value cannot carry.
fn plain_value(selector: &str, field: Field, raw: &str) -> Result<sea_query::Value> {
    match field.kind {
        FieldType::String => Ok(raw.into()),
        FieldType::Number => {
            let number: f64 = raw.parse().map_err(|_| {
                RsqlError(format!(
                    "Field \"{selector}\" expects a number, got \"{raw}\""
                ))
            })?;
            if !number.is_finite() {
                return Err(RsqlError(format!(
                    "Field \"{selector}\" expects a number, got \"{raw}\""
                )));
            }
            if number.fract() == 0.0 && number.abs() < i64::MAX as f64 {
                Ok((number as i64).into())
            } else {
                Ok(number.into())
            }
        }
        FieldType::Date => Ok(crate::format_timestamp(parse_date(raw).ok_or_else(|| {
            RsqlError(format!(
                "Field \"{selector}\" expects a date (e.g. 2025-01-01 or ISO datetime), \
                 got \"{raw}\""
            ))
        })?)
        .into()),
        FieldType::StringArray => Err(RsqlError(format!(
            "Field \"{selector}\" is an array and only supports ==, !=, =in= and =out="
        ))),
    }
}

/// `raw` coerced to the field's type, rejecting values that do not fit.
///
/// Returns an expression rather than a value so a timestamp can carry its
/// Postgres cast — see the `Date` arm.
fn coerced(selector: &str, field: Field, raw: &str, dialect: Dialect) -> Result<SimpleExpr> {
    match field.kind {
        FieldType::String => Ok(Expr::val(raw).into()),
        FieldType::Number => {
            let number: f64 = raw.parse().map_err(|_| {
                RsqlError(format!(
                    "Field \"{selector}\" expects a number, got \"{raw}\""
                ))
            })?;
            if !number.is_finite() {
                return Err(RsqlError(format!(
                    "Field \"{selector}\" expects a number, got \"{raw}\""
                )));
            }
            // Integral values bind as integers so comparisons against integer
            // columns do not go through a float.
            if number.fract() == 0.0 && number.abs() < i64::MAX as f64 {
                Ok(Expr::val(number as i64).into())
            } else {
                Ok(Expr::val(number).into())
            }
        }
        FieldType::Date => {
            let parsed = parse_date(raw).ok_or_else(|| {
                RsqlError(format!(
                    "Field \"{selector}\" expects a date (e.g. 2025-01-01 or ISO datetime), \
                     got \"{raw}\""
                ))
            })?;
            // Bound as the canonical ISO-8601 text, *not* as a native
            // `DateTime` — sea-query would render that as
            // `2025-01-01 00:00:00.000000 +00:00`, and SQLite stores
            // `2025-01-01T00:00:00.000Z` in a TEXT column and compares it
            // lexicographically. A space where a `T` belongs sorts differently,
            // so every date filter would silently match the wrong rows.
            let text = crate::format_timestamp(parsed);
            match dialect {
                Dialect::Sqlite => Ok(Expr::val(text).into()),
                // On Postgres the column is a real `timestamptz` and a bound
                // parameter is typed `text`, for which `timestamptz >= text`
                // has no operator — so the cast is required rather than
                // decorative.
                Dialect::Postgres => Ok(Expr::val(text).cast_as(Alias::new("timestamptz"))),
            }
        }
        FieldType::StringArray => Err(RsqlError(format!(
            "Field \"{selector}\" is an array and only supports ==, !=, =in= and =out="
        ))),
    }
}

/// Does the sea-query compiler agree with the one it replaces?
///
/// Every handler being migrated swaps [`compile`] for [`compile_expr`], so any
/// difference between them is a behaviour change nobody asked for — a filter
/// that quietly matches different rows after a refactor. These compare the two
/// on the same inputs rather than asserting each one's output separately,
/// because it is the *agreement* that matters.
#[cfg(test)]
mod equivalence {
    use super::tests::FIELDS;
    use super::*;
    use sea_query::{Query, SqliteQueryBuilder};

    /// Renders an expression as a standalone condition, values inlined, so it
    /// can be compared as text.
    fn expr_sql(filter: &str, dialect: Dialect) -> String {
        let expr = compile_expr(filter, FIELDS, dialect).expect(filter);
        let rendered = Query::select()
            .expr(sea_query::Expr::val(1))
            .and_where(expr)
            .to_string(SqliteQueryBuilder);
        // Everything after WHERE, with sea-query's quoting removed so the two
        // compilers can be compared on structure rather than on style.
        rendered
            .split_once(" WHERE ")
            .map(|(_, condition)| condition.replace('"', ""))
            .unwrap_or_default()
    }

    /// The legacy compiler's text, with its placeholders filled in from its
    /// own arguments, so both sides are literal SQL.
    fn legacy_sql(filter: &str, dialect: Dialect) -> String {
        let sql = compile(filter, FIELDS, dialect).expect(filter);
        let mut text = sql.render();
        for arg in sql.args() {
            let literal = match arg {
                Arg::Text(value) => format!("'{}'", value.replace('\'', "''")),
                Arg::Int(value) => value.to_string(),
                Arg::Float(value) => value.to_string(),
                Arg::Bool(value) => value.to_string().to_uppercase(),
                Arg::Null => "NULL".to_string(),
            };
            let placeholder = match dialect {
                Dialect::Sqlite => "?".to_string(),
                Dialect::Postgres => {
                    let index = text.matches('$').count();
                    let _ = index;
                    // Replace the lowest-numbered remaining placeholder.
                    (1..=sql.args().len())
                        .map(|n| format!("${n}"))
                        .find(|candidate| text.contains(candidate))
                        .unwrap_or_default()
                }
            };
            text = text.replacen(&placeholder, &literal, 1);
        }
        text
    }

    /// Filters covering every operator and field type the grammar has.
    const CASES: &[&str] = &[
        r#"title=="Discovery""#,
        "artist!=Eminem",
        r#"title=="Dis*""#,
        r#"title!="Dis*""#,
        "uri==null",
        "uri!=null",
        "duration=gt=200000",
        "duration=ge=200000",
        "duration=lt=200000",
        "duration=le=200000",
        "duration==200000",
        "genre=in=(house,electro)",
        "genre=out=(house,electro)",
        "createdAt=ge=2025-01-01",
        "(genre==house,genre==electro);duration=gt=200000",
        r#"title=="a'quote""#,
    ];

    /// Strips one redundant outermost paren.
    ///
    /// The legacy compiler parenthesizes every `AND`/`OR` including the
    /// outermost one, where sea-query omits it because nothing follows that
    /// could bind tighter. The inner grouping — the part that changes which
    /// rows match — is compared exactly.
    fn unwrapped(condition: &str) -> &str {
        let trimmed = condition.trim();
        let Some(inner) = trimmed.strip_prefix('(').and_then(|s| s.strip_suffix(')')) else {
            return trimmed;
        };
        // Only when that paren really is the outermost pair, so
        // `(a) AND (b)` is left alone.
        let mut depth = 0i32;
        for ch in inner.chars() {
            match ch {
                '(' => depth += 1,
                ')' => depth -= 1,
                _ => {}
            }
            if depth < 0 {
                return trimmed;
            }
        }
        if depth == 0 {
            inner
        } else {
            trimmed
        }
    }

    #[test]
    fn both_compilers_agree_on_sqlite() {
        for filter in CASES {
            let new = expr_sql(filter, Dialect::Sqlite);
            let old = legacy_sql(filter, Dialect::Sqlite);
            assert_eq!(
                unwrapped(&new),
                unwrapped(&old),
                "disagreement on {filter}\n  sea-query: {new}\n  legacy:    {old}"
            );
        }
    }

    /// The outer-paren stripper must not flatten a condition whose parens are
    /// two separate groups, or the test above would pass on real differences.
    #[test]
    fn the_paren_stripper_only_removes_a_true_outer_pair() {
        assert_eq!(unwrapped("(a AND b)"), "a AND b");
        assert_eq!(unwrapped("(a) AND (b)"), "(a) AND (b)");
        assert_eq!(unwrapped("a AND b"), "a AND b");
        assert_eq!(unwrapped("((a OR b) AND c)"), "(a OR b) AND c");
    }

    /// The same, for the dialect-specific operators: `ILIKE` and the array
    /// forms only appear on Postgres.
    #[test]
    fn the_postgres_only_operators_are_emitted() {
        let like = compile_expr(r#"title=="Dis*""#, FIELDS, Dialect::Postgres).unwrap();
        let rendered = Query::select()
            .expr(sea_query::Expr::val(1))
            .and_where(like)
            .to_string(sea_query::PostgresQueryBuilder);
        assert!(rendered.contains("ILIKE"), "{rendered}");
        // Postgres gets an E-string, in which `\\` is one backslash — the
        // same escape character, spelled the way that dialect requires.
        assert!(rendered.contains(r"ESCAPE E'\\'"), "{rendered}");

        // SQLite gets plain LIKE, which is already case-insensitive there,
        // and a plain quoted escape character.
        let sqlite = expr_sql(r#"title=="Dis*""#, Dialect::Sqlite);
        assert!(sqlite.contains("LIKE"), "{sqlite}");
        assert!(!sqlite.contains("ILIKE"), "{sqlite}");
        assert!(sqlite.contains(r"ESCAPE '\'"), "{sqlite}");
    }

    /// Array containment is a different operator on each backend, and both are
    /// hand-written, so both are checked — through the *binder*, not
    /// `to_string`.
    ///
    /// That distinction is the whole point of this test. `to_string` inlines
    /// values, so it renders `'house' = ANY(…)` and looks correct however the
    /// markers were written. Under the binder, a marker sea-query fails to
    /// substitute shows up as a dropped value — which is what happened: the
    /// Postgres form was `col @> ARRAY[$1]::text[]`, whose `$1` sits inside
    /// brackets the tokenizer will not look into, so the value never bound and
    /// the literal `$1` collided with the statement's own first parameter.
    #[test]
    fn array_containment_binds_on_each_backend() {
        use sea_query_binder::SqlxBinder;

        for (filter, expected) in [
            ("genres==house", vec!["house"]),
            ("genres=in=(house,techno)", vec!["house", "techno"]),
        ] {
            for dialect in [Dialect::Postgres, Dialect::Sqlite] {
                let expr = compile_expr(filter, FIELDS, dialect).unwrap();
                let mut query = Query::select();
                query
                    .expr(sea_query::Expr::val(1))
                    // A parameter first, so an unsubstituted marker collides
                    // with it rather than going unnoticed.
                    .and_where(sea_query::Expr::cust_with_values(
                        match dialect {
                            Dialect::Postgres => "1 = $1",
                            Dialect::Sqlite => "1 = ?",
                        },
                        [1],
                    ))
                    .and_where(expr);

                let (sql, values) = match dialect {
                    Dialect::Postgres => query.build_sqlx(sea_query::PostgresQueryBuilder),
                    Dialect::Sqlite => query.build_sqlx(sea_query::SqliteQueryBuilder),
                };

                let bound: Vec<String> = values
                    .0
                     .0
                    .iter()
                    .filter_map(|v| match v {
                        sea_query::Value::String(Some(s)) => Some(s.to_string()),
                        _ => None,
                    })
                    .collect();

                for value in &expected {
                    assert!(
                        bound.contains(&value.to_string()),
                        "{dialect:?} dropped {value:?} from {filter}: {sql} {bound:?}"
                    );
                    assert!(
                        !sql.contains(&format!("'{value}'")),
                        "{dialect:?} spliced {value:?}: {sql}"
                    );
                }
            }
        }

        // The operators themselves, so a rewrite cannot quietly become a
        // no-op that binds correctly.
        assert!(expr_sql("genres==house", Dialect::Sqlite).contains("json_each"));
        assert!(expr_sql("genres==house", Dialect::Postgres).contains("ANY"));
        assert!(expr_sql("genres=in=(house,techno)", Dialect::Sqlite).contains("json_each"));
        assert!(expr_sql("genres=in=(house,techno)", Dialect::Postgres).contains("unnest"));
    }

    /// An unknown selector must still be rejected, and still name what is
    /// allowed — the error is part of the API.
    #[test]
    fn an_unknown_field_is_rejected_by_both() {
        let legacy = compile("nope==1", FIELDS, Dialect::Sqlite).unwrap_err();
        let expr = compile_expr("nope==1", FIELDS, Dialect::Sqlite).unwrap_err();
        assert_eq!(legacy.to_string(), expr.to_string());
        assert!(expr.to_string().contains("Unknown filter field"), "{expr}");
        assert!(expr.to_string().contains("title"), "{expr}");
    }

    /// A non-numeric value for a number field, and a bad date, are rejected
    /// identically.
    #[test]
    fn coercion_failures_match() {
        for filter in ["duration==abc", "createdAt==notadate"] {
            let legacy = compile(filter, FIELDS, Dialect::Sqlite).unwrap_err();
            let expr = compile_expr(filter, FIELDS, Dialect::Sqlite).unwrap_err();
            assert_eq!(legacy.to_string(), expr.to_string(), "{filter}");
        }
    }

    /// An array field only supports the four operators the error names.
    #[test]
    fn ordering_an_array_field_is_rejected() {
        let expr = compile_expr("genres=gt=house", FIELDS, Dialect::Sqlite).unwrap_err();
        assert!(expr.to_string().contains("is an array"), "{expr}");
    }

    /// A blank filter is no condition, not a condition that matches nothing.
    #[test]
    fn a_blank_filter_is_absent() {
        for filter in [None, Some(""), Some("   ")] {
            assert!(
                compile_expr_param(filter, FIELDS, Dialect::Sqlite)
                    .unwrap()
                    .is_none(),
                "{filter:?}"
            );
        }
    }
}

/// Array containment, executed rather than only rendered.
///
/// The text-only tests above missed a real bug: the SQLite branch used `$1`,
/// which sea-query substitutes for Postgres only, so the statement carried a
/// literal `$1`, bound nothing and matched nothing — and the assertions passed
/// because they only checked that `json_each` appeared. Anything whose
/// correctness depends on a value actually being bound is tested here against
/// a real database.
#[cfg(test)]
mod array_execution {
    use super::tests::FIELDS;
    use super::*;
    use sea_query::Query;

    async fn seeded() -> crate::Backend {
        let db = crate::connect_in_memory().await.unwrap();
        for (id, name, genres) in [
            ("rec_a1", "Coreband", r#"["metalcore","metal"]"#),
            ("rec_a2", "Popband", r#"["dance pop"]"#),
            ("rec_a3", "Ampersand", r#"["r&b","soul"]"#),
            ("rec_a4", "Untagged", "[]"),
        ] {
            let insert = Query::insert()
                .into_table(crate::schema::Artists::Table)
                .columns([
                    crate::schema::Artists::XataId,
                    crate::schema::Artists::Name,
                    crate::schema::Artists::Sha256,
                    crate::schema::Artists::Genres,
                ])
                .values_panic([id.into(), name.into(), id.into(), genres.into()])
                .to_owned();
            db.execute(&insert).await.unwrap();
        }
        db
    }

    /// Names matching a filter, so the assertion is about rows rather than SQL.
    async fn matching(db: &crate::Backend, filter: &str) -> Vec<String> {
        let condition = compile_expr(filter, FIELDS, db.dialect()).expect(filter);
        let query = Query::select()
            .column(crate::schema::Artists::Name)
            .from(crate::schema::Artists::Table)
            .and_where(condition)
            .order_by(crate::schema::Artists::Name, sea_query::Order::Asc)
            .to_owned();
        db.fetch_scalars::<String>(&query).await.unwrap()
    }

    #[tokio::test]
    async fn containment_matches_the_tagged_rows() {
        let db = seeded().await;

        assert_eq!(matching(&db, "genres==metalcore").await, vec!["Coreband"]);
        assert_eq!(matching(&db, "genres==metal").await, vec!["Coreband"]);
        assert_eq!(
            matching(&db, r#"genres=="dance pop""#).await,
            vec!["Popband"]
        );

        // An empty array and an absent genre both match nothing.
        assert!(matching(&db, "genres==nonexistent").await.is_empty());
    }

    /// An element with a character that means something in SQL has to survive
    /// being bound, which is the whole reason it is a parameter.
    #[tokio::test]
    async fn an_element_with_an_ampersand_matches() {
        let db = seeded().await;
        assert_eq!(matching(&db, r#"genres=="r&b""#).await, vec!["Ampersand"]);
    }

    #[tokio::test]
    async fn overlap_matches_any_of_the_listed_elements() {
        let db = seeded().await;

        let mut both = matching(&db, "genres=in=(metalcore,soul)").await;
        both.sort();
        assert_eq!(both, vec!["Ampersand", "Coreband"]);

        assert_eq!(
            matching(&db, "genres=in=(nonexistent,metalcore)").await,
            vec!["Coreband"]
        );
        assert!(matching(&db, "genres=in=(nothing,here)").await.is_empty());
    }

    /// Negation is the complement, and must include the untagged row rather
    /// than dropping it.
    #[tokio::test]
    async fn negated_containment_excludes_only_the_matches() {
        let db = seeded().await;

        let mut others = matching(&db, "genres!=metalcore").await;
        others.sort();
        assert_eq!(others, vec!["Ampersand", "Popband", "Untagged"]);
    }
}

/// Array containment, executed against a real Postgres.
///
/// Gated on `ROCKSKY_TEST_POSTGRES_URL`, because it needs a server:
///
/// ```sh
/// ROCKSKY_TEST_POSTGRES_URL=postgres://postgres:pw@127.0.0.1:55432/probe \
///   cargo test -p rocksky-db --lib postgres_arrays
/// ```
///
/// The reason this exists rather than another rendering assertion: the bug it
/// guards produced *valid SQL that ran and returned wrong rows*. Only
/// executing it against Postgres, with a real `text[]`, can tell.
#[cfg(test)]
mod postgres_arrays {
    use super::tests::FIELDS;
    use super::*;
    use sea_query::Query;
    use sea_query_binder::SqlxBinder;

    fn url() -> Option<String> {
        std::env::var("ROCKSKY_TEST_POSTGRES_URL")
            .ok()
            .filter(|u| !u.is_empty())
    }

    async fn matching(pool: &sqlx::PgPool, filter: &str) -> Vec<String> {
        let expr = compile_expr(filter, FIELDS, Dialect::Postgres).unwrap();
        let (sql, values) = Query::select()
            .column(sea_query::Alias::new("name"))
            .from(sea_query::Alias::new("artists"))
            // A bound parameter *before* the filter: an unsubstituted marker
            // in the filter collides with this one, which is exactly how the
            // original bug turned into wrong rows rather than an error.
            .and_where(sea_query::Expr::col(sea_query::Alias::new("name")).ne("nobody"))
            .and_where(expr)
            .order_by(sea_query::Alias::new("name"), sea_query::Order::Asc)
            .to_owned()
            .build_sqlx(sea_query::PostgresQueryBuilder);

        sqlx::query_scalar_with::<sqlx::Postgres, String, _>(&sql, values)
            .fetch_all(pool)
            .await
            .unwrap_or_else(|err| panic!("{filter} failed: {err}\n{}", sql))
    }

    #[tokio::test]
    async fn containment_and_overlap_return_the_right_rows() {
        let Some(url) = url() else {
            eprintln!("skipping: ROCKSKY_TEST_POSTGRES_URL is not set");
            return;
        };
        let pool = sqlx::PgPool::connect(&url).await.expect("connect");

        // `artists` holds A -> {rock, metal} and B -> {house}.
        assert_eq!(matching(&pool, "genres==rock").await, vec!["A".to_string()]);
        assert_eq!(
            matching(&pool, "genres==house").await,
            vec!["B".to_string()]
        );
        assert!(matching(&pool, "genres==jazz").await.is_empty());

        // Overlap: any of the listed genres.
        assert_eq!(
            matching(&pool, "genres=in=(house,metal)").await,
            vec!["A".to_string(), "B".to_string()]
        );
        assert_eq!(
            matching(&pool, "genres=in=(house)").await,
            vec!["B".to_string()]
        );
        assert!(matching(&pool, "genres=in=(jazz,funk)").await.is_empty());

        // Negation, which is the same operator wrapped in NOT.
        assert_eq!(matching(&pool, "genres!=rock").await, vec!["B".to_string()]);
    }
}
