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

use crate::db::query::{Arg, Sql};
use crate::db::Dialect;
use crate::error::XrpcError;

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

impl From<RsqlError> for XrpcError {
    /// Surfaces as a 400 named `InvalidFilter`, matching what
    /// `compileRsqlFilterParam` throws. A masked empty result would be much
    /// harder for a client to debug than a rejection.
    fn from(err: RsqlError) -> Self {
        XrpcError::invalid_request(err.0).named("InvalidFilter")
    }
}

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
) -> std::result::Result<Option<Sql>, XrpcError> {
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

    const FIELDS: FieldMap = &[
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
    fn a_rejected_filter_becomes_a_400_named_invalid_filter() {
        let err = compile("password==hunter2", FIELDS, Dialect::Sqlite).unwrap_err();
        let xrpc: XrpcError = err.into();
        let body = xrpc.body();
        assert_eq!(body.error, "InvalidFilter");
        assert_eq!(xrpc.kind.status(), 400);
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
