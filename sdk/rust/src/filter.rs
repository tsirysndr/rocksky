//! Fluent builder for RSQL filter expressions, accepted by the `filter`
//! parameter of the catalog and scrobble-feed queries
//! (`app.rocksky.song.getSongs`, `app.rocksky.artist.getArtists`,
//! `app.rocksky.album.getAlbums`, `app.rocksky.scrobble.getScrobbles`).
//!
//! ```
//! use rocksky::Filter;
//!
//! let filter = Filter::eq("artist", "Daft Punk")
//!     .and(Filter::gt("duration", 200_000))
//!     .or(Filter::is_in("genre", ["house", "electro"]));
//!
//! assert_eq!(
//!     filter.build(),
//!     "artist==\"Daft Punk\";duration=gt=200000,genre=in=(house,electro)",
//! );
//! ```
//!
//! String values are quoted and escaped automatically when they contain
//! characters RSQL reserves; `*` wildcards pass through unquoted so
//! `Filter::eq("artist", "Daft*")` performs a case-insensitive match.

use std::fmt;

/// A single value in an RSQL comparison. Constructed implicitly via
/// `Into<FilterValue>` from `&str`, `String`, `i64`, `i32`, `u32`, `f64`
/// and `bool`.
#[derive(Debug, Clone, PartialEq)]
pub enum FilterValue {
    /// A string value; quoted/escaped on render when needed.
    Str(String),
    /// An integer value; rendered bare, without decimals.
    Int(i64),
    /// A floating-point value; rendered with Rust's minimal `Display` repr.
    Float(f64),
    /// A boolean; rendered as `true` / `false`.
    Bool(bool),
}

impl From<&str> for FilterValue {
    fn from(v: &str) -> Self {
        FilterValue::Str(v.to_owned())
    }
}
impl From<String> for FilterValue {
    fn from(v: String) -> Self {
        FilterValue::Str(v)
    }
}
impl From<i64> for FilterValue {
    fn from(v: i64) -> Self {
        FilterValue::Int(v)
    }
}
impl From<i32> for FilterValue {
    fn from(v: i32) -> Self {
        FilterValue::Int(v as i64)
    }
}
impl From<u32> for FilterValue {
    fn from(v: u32) -> Self {
        FilterValue::Int(v as i64)
    }
}
impl From<f64> for FilterValue {
    fn from(v: f64) -> Self {
        FilterValue::Float(v)
    }
}
impl From<bool> for FilterValue {
    fn from(v: bool) -> Self {
        FilterValue::Bool(v)
    }
}

/// Characters that never need quoting in an RSQL value
/// (`*` kept bare so wildcards work).
fn is_safe_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | ':' | '@' | '*' | '+' | '-')
}

fn render_value(value: &FilterValue) -> String {
    match value {
        FilterValue::Int(n) => n.to_string(),
        FilterValue::Float(n) => n.to_string(),
        FilterValue::Bool(b) => b.to_string(),
        FilterValue::Str(s) => {
            if !s.is_empty() && s.chars().all(is_safe_char) {
                s.clone()
            } else {
                let escaped = s.replace('\\', "\\\\").replace('"', "\\\"");
                format!("\"{escaped}\"")
            }
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum NodeKind {
    Comparison,
    And,
    Or,
}

/// Fluent builder for RSQL filter expressions. See the [module docs](self).
#[derive(Debug, Clone)]
pub struct Filter {
    expr: String,
    kind: NodeKind,
}

impl Filter {
    fn comparison(field: &str, op: &str, value: FilterValue) -> Self {
        Filter {
            expr: format!("{field}{op}{}", render_value(&value)),
            kind: NodeKind::Comparison,
        }
    }

    fn list<I, V>(field: &str, op: &str, name: &str, values: I) -> Self
    where
        I: IntoIterator<Item = V>,
        V: Into<FilterValue>,
    {
        let rendered: Vec<String> = values
            .into_iter()
            .map(|v| render_value(&v.into()))
            .collect();
        if rendered.is_empty() {
            panic!("Filter::{name}(\"{field}\", ...) needs at least one value");
        }
        Filter {
            expr: format!("{field}{op}({})", rendered.join(",")),
            kind: NodeKind::Comparison,
        }
    }

    /// `field==value` — equals; `*` in string values is a wildcard.
    pub fn eq(field: impl AsRef<str>, value: impl Into<FilterValue>) -> Self {
        Filter::comparison(field.as_ref(), "==", value.into())
    }

    /// `field!=value` — not equals.
    pub fn ne(field: impl AsRef<str>, value: impl Into<FilterValue>) -> Self {
        Filter::comparison(field.as_ref(), "!=", value.into())
    }

    /// `field=gt=value` — greater than.
    pub fn gt(field: impl AsRef<str>, value: impl Into<FilterValue>) -> Self {
        Filter::comparison(field.as_ref(), "=gt=", value.into())
    }

    /// `field=ge=value` — greater than or equal.
    pub fn ge(field: impl AsRef<str>, value: impl Into<FilterValue>) -> Self {
        Filter::comparison(field.as_ref(), "=ge=", value.into())
    }

    /// `field=lt=value` — less than.
    pub fn lt(field: impl AsRef<str>, value: impl Into<FilterValue>) -> Self {
        Filter::comparison(field.as_ref(), "=lt=", value.into())
    }

    /// `field=le=value` — less than or equal.
    pub fn le(field: impl AsRef<str>, value: impl Into<FilterValue>) -> Self {
        Filter::comparison(field.as_ref(), "=le=", value.into())
    }

    /// `field=in=(a,b)` — matches any of the values.
    ///
    /// # Panics
    /// Panics if `values` is empty.
    pub fn is_in<I, V>(field: impl AsRef<str>, values: I) -> Self
    where
        I: IntoIterator<Item = V>,
        V: Into<FilterValue>,
    {
        Filter::list(field.as_ref(), "=in=", "is_in", values)
    }

    /// `field=out=(a,b)` — matches none of the values.
    ///
    /// # Panics
    /// Panics if `values` is empty.
    pub fn is_out<I, V>(field: impl AsRef<str>, values: I) -> Self
    where
        I: IntoIterator<Item = V>,
        V: Into<FilterValue>,
    {
        Filter::list(field.as_ref(), "=out=", "is_out", values)
    }

    /// `field==null` — the field is NULL.
    pub fn is_null(field: impl AsRef<str>) -> Self {
        Filter {
            expr: format!("{}==null", field.as_ref()),
            kind: NodeKind::Comparison,
        }
    }

    /// `field!=null` — the field is not NULL.
    pub fn is_not_null(field: impl AsRef<str>) -> Self {
        Filter {
            expr: format!("{}!=null", field.as_ref()),
            kind: NodeKind::Comparison,
        }
    }

    /// Both sides must match (`;`). An `or` operand is parenthesized to keep
    /// RSQL precedence.
    pub fn and(self, other: Filter) -> Self {
        Filter {
            expr: format!("{};{}", self.render_in_and(), other.render_in_and()),
            kind: NodeKind::And,
        }
    }

    /// Either side may match (`,`).
    pub fn or(self, other: Filter) -> Self {
        Filter {
            expr: format!("{},{}", self.expr, other.expr),
            kind: NodeKind::Or,
        }
    }

    fn render_in_and(&self) -> String {
        if self.kind == NodeKind::Or {
            format!("({})", self.expr)
        } else {
            self.expr.clone()
        }
    }

    /// The RSQL expression string to send as the `filter` query param.
    pub fn build(self) -> String {
        self.expr
    }
}

impl fmt::Display for Filter {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.expr)
    }
}

impl From<Filter> for String {
    fn from(filter: Filter) -> Self {
        filter.expr
    }
}

#[cfg(test)]
mod tests {
    use super::Filter;

    #[test]
    fn eq_bare() {
        assert_eq!(Filter::eq("artist", "Radiohead").build(), "artist==Radiohead");
    }

    #[test]
    fn eq_quoted_space() {
        assert_eq!(
            Filter::eq("artist", "Daft Punk").build(),
            "artist==\"Daft Punk\""
        );
    }

    #[test]
    fn eq_escapes_embedded_quotes() {
        assert_eq!(
            Filter::eq("title", r#"He said "hi""#).build(),
            "title==\"He said \\\"hi\\\"\""
        );
    }

    #[test]
    fn eq_wildcard_unquoted() {
        assert_eq!(Filter::eq("artist", "Daft*").build(), "artist==Daft*");
    }

    #[test]
    fn ne() {
        assert_eq!(Filter::ne("artist", "Eminem").build(), "artist!=Eminem");
    }

    #[test]
    fn gt() {
        assert_eq!(Filter::gt("duration", 200000).build(), "duration=gt=200000");
    }

    #[test]
    fn ge() {
        assert_eq!(Filter::ge("year", 2000).build(), "year=ge=2000");
    }

    #[test]
    fn lt() {
        assert_eq!(Filter::lt("trackNumber", 5).build(), "trackNumber=lt=5");
    }

    #[test]
    fn le() {
        assert_eq!(Filter::le("year", 1999).build(), "year=le=1999");
    }

    #[test]
    fn is_in() {
        assert_eq!(
            Filter::is_in("genre", ["house", "electro"]).build(),
            "genre=in=(house,electro)"
        );
    }

    #[test]
    fn is_out_quotes_unsafe_values() {
        assert_eq!(
            Filter::is_out("genre", ["hip hop"]).build(),
            "genre=out=(\"hip hop\")"
        );
    }

    #[test]
    #[should_panic(expected = "needs at least one value")]
    fn is_in_empty_panics() {
        let _ = Filter::is_in("genre", Vec::<String>::new());
    }

    #[test]
    #[should_panic(expected = "needs at least one value")]
    fn is_out_empty_panics() {
        let _ = Filter::is_out("genre", Vec::<String>::new());
    }

    #[test]
    fn is_null() {
        assert_eq!(Filter::is_null("uri").build(), "uri==null");
    }

    #[test]
    fn is_not_null() {
        assert_eq!(Filter::is_not_null("uri").build(), "uri!=null");
    }

    #[test]
    fn and_chain() {
        assert_eq!(
            Filter::eq("artist", "Radiohead")
                .and(Filter::gt("duration", 200000))
                .build(),
            "artist==Radiohead;duration=gt=200000"
        );
    }

    #[test]
    fn or_chain() {
        assert_eq!(
            Filter::eq("artist", "Radiohead")
                .or(Filter::eq("artist", "Muse"))
                .build(),
            "artist==Radiohead,artist==Muse"
        );
    }

    #[test]
    fn or_then_and_parenthesizes_left_or() {
        assert_eq!(
            Filter::eq("artist", "Radiohead")
                .or(Filter::eq("artist", "Muse"))
                .and(Filter::gt("duration", 200000))
                .build(),
            "(artist==Radiohead,artist==Muse);duration=gt=200000"
        );
    }

    #[test]
    fn and_with_or_operand_parenthesizes_right_or() {
        assert_eq!(
            Filter::eq("artist", "Radiohead")
                .and(Filter::eq("genre", "house").or(Filter::eq("genre", "electro")))
                .build(),
            "artist==Radiohead;(genre==house,genre==electro)"
        );
    }

    #[test]
    fn and_then_or_adds_no_parentheses() {
        assert_eq!(
            Filter::eq("artist", "Radiohead")
                .and(Filter::gt("duration", 200000))
                .or(Filter::eq("genre", "house"))
                .build(),
            "artist==Radiohead;duration=gt=200000,genre==house"
        );
    }

    #[test]
    fn dotted_field() {
        assert_eq!(
            Filter::eq("track.artist", "Daft Punk").build(),
            "track.artist==\"Daft Punk\""
        );
    }

    #[test]
    fn bool_value() {
        assert_eq!(Filter::eq("liked", true).build(), "liked==true");
    }

    #[test]
    fn display_and_from_string() {
        let f = Filter::eq("artist", "Radiohead");
        assert_eq!(f.to_string(), "artist==Radiohead");
        let s: String = f.into();
        assert_eq!(s, "artist==Radiohead");
    }
}
