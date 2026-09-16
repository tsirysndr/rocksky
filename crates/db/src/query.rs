//! A tiny dialect-portable query layer.
//!
//! `sqlx::Any` is not usable for this: it neither rewrites placeholders nor
//! tells you which backend you are on (`AnyKind` is deprecated and "not used or
//! returned by any API"), and its type set does not cover `chrono`. So the
//! backend is an enum and queries are built here.
//!
//! Two rules make the difference between the dialects manageable:
//!
//! 1. **SQL is written once, with `?` placeholders.** [`Sql::bind`] appends the
//!    placeholder *and* the argument together, so the two can never drift out
//!    of sync, and [`Dialect::rewrite`] renumbers them to `$1, $2, …` for
//!    Postgres.
//! 2. **Column lists are dialect-aware** (see [`super::models`]). Postgres
//!    `int4` will not decode into `i64` and `text[]` will not decode into a
//!    `String`, so the Postgres column lists cast: `year::bigint`,
//!    `to_json(genres)::text`. Every row therefore decodes into one shared
//!    struct regardless of backend.

use super::Dialect;

/// A bound value. Deliberately narrow — these are the only types the appview
/// binds — so encoding to either backend stays exhaustive and checked.
#[derive(Debug, Clone, PartialEq)]
pub enum Arg {
    Text(String),
    Int(i64),
    Float(f64),
    Bool(bool),
    Null,
}

impl From<String> for Arg {
    fn from(value: String) -> Self {
        Self::Text(value)
    }
}

impl From<&String> for Arg {
    fn from(value: &String) -> Self {
        Self::Text(value.clone())
    }
}

impl From<&str> for Arg {
    fn from(value: &str) -> Self {
        Self::Text(value.to_string())
    }
}

impl From<i64> for Arg {
    fn from(value: i64) -> Self {
        Self::Int(value)
    }
}

impl From<i32> for Arg {
    fn from(value: i32) -> Self {
        Self::Int(value.into())
    }
}

impl From<f64> for Arg {
    fn from(value: f64) -> Self {
        Self::Float(value)
    }
}

impl From<bool> for Arg {
    fn from(value: bool) -> Self {
        Self::Bool(value)
    }
}

impl From<chrono::DateTime<chrono::Utc>> for Arg {
    /// Timestamps bind as the canonical ISO-8601 text. SQLite stores that
    /// directly, and Postgres casts it on comparison against a `timestamptz`.
    fn from(value: chrono::DateTime<chrono::Utc>) -> Self {
        Self::Text(super::format_timestamp(value))
    }
}

impl<T> From<Option<T>> for Arg
where
    T: Into<Arg>,
{
    fn from(value: Option<T>) -> Self {
        match value {
            Some(inner) => inner.into(),
            None => Self::Null,
        }
    }
}

/// A statement under construction: SQL text plus the values bound into it.
///
/// Carries its [`Dialect`] so that binds needing a cast (timestamps) can emit
/// one without the caller having to remember which backend is active.
#[derive(Debug, Clone)]
pub struct Sql {
    dialect: Dialect,
    text: String,
    args: Vec<Arg>,
}

impl Sql {
    pub fn new(dialect: Dialect, text: impl Into<String>) -> Self {
        Self {
            dialect,
            text: text.into(),
            args: Vec::new(),
        }
    }

    /// An empty fragment, for building up a `WHERE` clause conditionally.
    pub fn empty(dialect: Dialect) -> Self {
        Self::new(dialect, "")
    }

    pub fn dialect(&self) -> Dialect {
        self.dialect
    }

    /// Appends raw SQL. Never pass caller-controlled text here — use
    /// [`Sql::bind`], which parameterizes.
    pub fn push(&mut self, text: impl AsRef<str>) -> &mut Self {
        self.text.push_str(text.as_ref());
        self
    }

    /// Appends a placeholder and its value as one step.
    pub fn bind(&mut self, arg: impl Into<Arg>) -> &mut Self {
        self.text.push('?');
        self.args.push(arg.into());
        self
    }

    /// Binds a timestamp for comparison against a datetime column.
    ///
    /// Timestamps travel as ISO-8601 text, which SQLite compares directly. On
    /// Postgres the parameter would be typed `text` and
    /// `timestamptz > text` has no operator, so the cast is required — getting
    /// this wrong is a runtime error on Postgres only, which is exactly the
    /// kind of bug a dialect layer should absorb.
    pub fn bind_timestamp(&mut self, value: chrono::DateTime<chrono::Utc>) -> &mut Self {
        self.bind(value);
        if self.dialect == Dialect::Postgres {
            self.text.push_str("::timestamptz");
        }
        self
    }

    /// Binds a value that must be compared as a timestamp, where the value is
    /// already ISO-8601 text (as RSQL date literals are).
    pub fn bind_timestamp_text(&mut self, value: impl Into<String>) -> &mut Self {
        self.bind(Arg::Text(value.into()));
        if self.dialect == Dialect::Postgres {
            self.text.push_str("::timestamptz");
        }
        self
    }

    /// Appends `(?, ?, …)` for an `IN` list. An empty list yields `(NULL)`,
    /// which matches nothing — the same as an empty `inArray` in Drizzle, and
    /// notably *not* a syntax error.
    pub fn bind_list<T: Into<Arg>>(&mut self, values: impl IntoIterator<Item = T>) -> &mut Self {
        let mut values = values.into_iter().peekable();
        if values.peek().is_none() {
            self.text.push_str("(NULL)");
            return self;
        }
        self.text.push('(');
        let mut first = true;
        for value in values {
            if !first {
                self.text.push_str(", ");
            }
            first = false;
            self.bind(value);
        }
        self.text.push(')');
        self
    }

    /// Appends another fragment, keeping argument order intact.
    pub fn append(&mut self, other: Sql) -> &mut Self {
        debug_assert_eq!(
            self.dialect, other.dialect,
            "fragments from different dialects cannot be combined"
        );
        self.text.push_str(&other.text);
        self.args.extend(other.args);
        self
    }

    pub fn text(&self) -> &str {
        &self.text
    }

    pub fn args(&self) -> &[Arg] {
        &self.args
    }

    pub fn is_empty(&self) -> bool {
        self.text.is_empty()
    }

    /// The final SQL, with placeholders renumbered if the dialect needs it.
    pub fn render(&self) -> String {
        self.dialect.rewrite(&self.text)
    }
}

impl Dialect {
    /// Renumbers `?` placeholders to `$1, $2, …` on Postgres. SQLite is
    /// returned untouched.
    ///
    /// Quoted literals are skipped so a `?` inside a string is left alone;
    /// the appview does not write such literals, but a rewriter that could
    /// corrupt them is a trap for whoever adds one later.
    pub fn rewrite(self, sql: &str) -> String {
        if self == Dialect::Sqlite {
            return sql.to_string();
        }

        let mut out = String::with_capacity(sql.len() + 16);
        let mut index = 0usize;
        let mut chars = sql.chars().peekable();

        while let Some(ch) = chars.next() {
            match ch {
                '\'' => {
                    // Copy through the closing quote, honouring '' escapes.
                    out.push(ch);
                    while let Some(inner) = chars.next() {
                        out.push(inner);
                        if inner == '\'' {
                            if chars.peek() == Some(&'\'') {
                                out.push(chars.next().unwrap());
                                continue;
                            }
                            break;
                        }
                    }
                }
                '?' => {
                    index += 1;
                    out.push('$');
                    out.push_str(&index.to_string());
                }
                _ => out.push(ch),
            }
        }

        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sqlite_sql_is_untouched() {
        let sql = "SELECT * FROM tracks WHERE uri = ? AND duration > ?";
        assert_eq!(Dialect::Sqlite.rewrite(sql), sql);
    }

    #[test]
    fn postgres_placeholders_are_numbered_in_order() {
        assert_eq!(
            Dialect::Postgres.rewrite("SELECT * FROM tracks WHERE uri = ? AND duration > ?"),
            "SELECT * FROM tracks WHERE uri = $1 AND duration > $2"
        );
    }

    #[test]
    fn question_marks_inside_literals_are_preserved() {
        assert_eq!(
            Dialect::Postgres.rewrite("SELECT ? WHERE title = 'what?' AND artist = ?"),
            "SELECT $1 WHERE title = 'what?' AND artist = $2"
        );
    }

    #[test]
    fn escaped_quotes_inside_literals_do_not_end_the_literal() {
        assert_eq!(
            Dialect::Postgres.rewrite("SELECT 'it''s a ?' , ?"),
            "SELECT 'it''s a ?' , $1"
        );
    }

    #[test]
    fn bind_keeps_placeholders_and_args_in_step() {
        let mut sql = Sql::new(Dialect::Postgres, "SELECT * FROM tracks WHERE uri = ");
        sql.bind("at://x").push(" AND duration > ").bind(1000i64);

        assert_eq!(
            sql.text(),
            "SELECT * FROM tracks WHERE uri = ? AND duration > ?"
        );
        assert_eq!(sql.args(), &[Arg::Text("at://x".into()), Arg::Int(1000)]);
        assert_eq!(
            sql.render(),
            "SELECT * FROM tracks WHERE uri = $1 AND duration > $2"
        );
    }

    #[test]
    fn optionals_bind_as_null() {
        let mut sql = Sql::new(Dialect::Sqlite, "SELECT ");
        sql.bind(None::<String>).push(", ").bind(Some("x"));
        assert_eq!(sql.args(), &[Arg::Null, Arg::Text("x".into())]);
    }

    #[test]
    fn an_empty_in_list_matches_nothing_rather_than_failing_to_parse() {
        let mut sql = Sql::new(Dialect::Sqlite, "SELECT * FROM users WHERE xata_id IN ");
        sql.bind_list(Vec::<String>::new());
        assert_eq!(sql.text(), "SELECT * FROM users WHERE xata_id IN (NULL)");
        assert!(sql.args().is_empty());
    }

    #[test]
    fn in_lists_bind_every_element() {
        let mut sql = Sql::new(Dialect::Postgres, "SELECT * FROM users WHERE xata_id IN ");
        sql.bind_list(vec!["a", "b", "c"]);
        assert_eq!(sql.text(), "SELECT * FROM users WHERE xata_id IN (?, ?, ?)");
        assert_eq!(sql.args().len(), 3);
        assert_eq!(
            sql.render(),
            "SELECT * FROM users WHERE xata_id IN ($1, $2, $3)"
        );
    }

    #[test]
    fn appending_preserves_argument_order() {
        let mut head = Sql::new(Dialect::Sqlite, "SELECT * FROM t WHERE a = ");
        head.bind("a");
        let mut tail = Sql::new(Dialect::Sqlite, " AND b = ");
        tail.bind("b");
        head.append(tail);

        assert_eq!(head.text(), "SELECT * FROM t WHERE a = ? AND b = ?");
        assert_eq!(head.args(), &[Arg::Text("a".into()), Arg::Text("b".into())]);
    }

    #[test]
    fn timestamp_binds_are_cast_on_postgres_only() {
        let when = chrono::DateTime::parse_from_rfc3339("2026-09-15T00:00:00Z")
            .unwrap()
            .with_timezone(&chrono::Utc);

        let mut sqlite = Sql::new(Dialect::Sqlite, "WHERE timestamp > ");
        sqlite.bind_timestamp(when);
        assert_eq!(sqlite.text(), "WHERE timestamp > ?");

        // `timestamptz > text` has no operator in Postgres, so the cast is not
        // cosmetic — without it the query fails at runtime.
        let mut postgres = Sql::new(Dialect::Postgres, "WHERE timestamp > ");
        postgres.bind_timestamp(when);
        assert_eq!(postgres.text(), "WHERE timestamp > ?::timestamptz");
        assert_eq!(postgres.render(), "WHERE timestamp > $1::timestamptz");
    }

    #[test]
    fn timestamps_bind_as_canonical_iso_text() {
        let when = chrono::DateTime::parse_from_rfc3339("2026-09-15T12:34:56.789Z")
            .unwrap()
            .with_timezone(&chrono::Utc);
        assert_eq!(
            Arg::from(when),
            Arg::Text("2026-09-15T12:34:56.789Z".into())
        );
    }
}
