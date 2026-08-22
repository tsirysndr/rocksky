//! Fluent builder for RSQL filter expressions, accepted by the `filter`
//! parameter of the catalog and scrobble-feed queries
//! (`app.rocksky.song.getSongs`, `app.rocksky.artist.getArtists`,
//! `app.rocksky.album.getAlbums`, `app.rocksky.scrobble.getScrobbles`).
//!
//! ```
//! use rocksky_sdk::Filter;
//!
//! let filter = Filter::eq("artist", "Daft Punk")
//!     .and(Filter::gt("duration", 200_000))
//!     .or(Filter::is_in("genre", ["house", "electro"]));
//! assert_eq!(
//!     filter.build(),
//!     r#"artist=="Daft Punk";duration=gt=200000,genre=in=(house,electro)"#
//! );
//! ```
//!
//! String values are quoted and escaped automatically when they contain
//! characters RSQL reserves; `*` wildcards pass through unquoted so
//! `Filter::eq("artist", "Daft*")` performs a case-insensitive match.
//!
//! Filterable fields per endpoint:
//! - songs: `title, artist, album, albumArtist, genre, composer, label,
//!   duration, trackNumber, discNumber, mbId, isrc, sha256, uri, albumUri,
//!   artistUri, createdAt`
//! - albums: `title, artist, year, releaseDate, sha256, uri, artistUri, createdAt`
//! - artists: `name, genres, bornIn, born, died, sha256, uri, createdAt`
//! - scrobbles: `uri, date, timestamp, title, artist, album, track.title,
//!   track.artist, track.album, track.albumArtist, track.genre,
//!   track.duration, track.isrc, track.mbId, user.did, user.handle,
//!   user.displayName, artist.name, artist.genres`

use std::fmt;

/// A value usable on the right-hand side of an RSQL comparison.
#[derive(Debug, Clone, PartialEq)]
pub enum FilterValue {
    Str(String),
    Int(i64),
    Float(f64),
    Bool(bool),
}

impl From<&str> for FilterValue {
    fn from(v: &str) -> Self {
        FilterValue::Str(v.to_string())
    }
}
impl From<String> for FilterValue {
    fn from(v: String) -> Self {
        FilterValue::Str(v)
    }
}
impl From<&String> for FilterValue {
    fn from(v: &String) -> Self {
        FilterValue::Str(v.clone())
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

fn is_safe(value: &str) -> bool {
    !value.is_empty()
        && value.chars().all(|c| {
            c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | ':' | '@' | '*' | '+' | '-')
        })
}

fn render(value: &FilterValue) -> String {
    match value {
        FilterValue::Int(v) => v.to_string(),
        FilterValue::Float(v) => v.to_string(),
        FilterValue::Bool(v) => v.to_string(),
        FilterValue::Str(v) if is_safe(v) => v.clone(),
        FilterValue::Str(v) => {
            format!("\"{}\"", v.replace('\\', "\\\\").replace('"', "\\\""))
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Kind {
    Comparison,
    And,
    Or,
}

/// An RSQL filter expression. See the [module docs](self) for the grammar.
#[derive(Debug, Clone, PartialEq)]
pub struct Filter {
    expr: String,
    kind: Kind,
}

impl Filter {
    fn comparison(field: &str, op: &str, value: impl Into<FilterValue>) -> Self {
        Filter {
            expr: format!("{field}{op}{}", render(&value.into())),
            kind: Kind::Comparison,
        }
    }

    fn list(
        field: &str,
        op: &str,
        values: impl IntoIterator<Item = impl Into<FilterValue>>,
    ) -> Self {
        let rendered: Vec<String> = values.into_iter().map(|v| render(&v.into())).collect();
        assert!(
            !rendered.is_empty(),
            "Filter {op} on \"{field}\" needs at least one value"
        );
        Filter {
            expr: format!("{field}{op}({})", rendered.join(",")),
            kind: Kind::Comparison,
        }
    }

    /// `field==value` — equals; `*` in string values is a wildcard.
    pub fn eq(field: &str, value: impl Into<FilterValue>) -> Self {
        Self::comparison(field, "==", value)
    }

    /// `field!=value` — not equals.
    pub fn ne(field: &str, value: impl Into<FilterValue>) -> Self {
        Self::comparison(field, "!=", value)
    }

    /// `field=gt=value` — greater than.
    pub fn gt(field: &str, value: impl Into<FilterValue>) -> Self {
        Self::comparison(field, "=gt=", value)
    }

    /// `field=ge=value` — greater than or equal.
    pub fn ge(field: &str, value: impl Into<FilterValue>) -> Self {
        Self::comparison(field, "=ge=", value)
    }

    /// `field=lt=value` — less than.
    pub fn lt(field: &str, value: impl Into<FilterValue>) -> Self {
        Self::comparison(field, "=lt=", value)
    }

    /// `field=le=value` — less than or equal.
    pub fn le(field: &str, value: impl Into<FilterValue>) -> Self {
        Self::comparison(field, "=le=", value)
    }

    /// `field=in=(a,b)` — matches any of the values. Panics on an empty list.
    pub fn is_in(field: &str, values: impl IntoIterator<Item = impl Into<FilterValue>>) -> Self {
        Self::list(field, "=in=", values)
    }

    /// `field=out=(a,b)` — matches none of the values. Panics on an empty list.
    pub fn is_out(field: &str, values: impl IntoIterator<Item = impl Into<FilterValue>>) -> Self {
        Self::list(field, "=out=", values)
    }

    /// `field==null` — the field is NULL.
    pub fn is_null(field: &str) -> Self {
        Filter {
            expr: format!("{field}==null"),
            kind: Kind::Comparison,
        }
    }

    /// `field!=null` — the field is not NULL.
    pub fn is_not_null(field: &str) -> Self {
        Filter {
            expr: format!("{field}!=null"),
            kind: Kind::Comparison,
        }
    }

    /// Both sides must match (`;`). An `or` operand is parenthesized to keep
    /// RSQL precedence.
    pub fn and(self, other: Filter) -> Filter {
        let wrap = |f: &Filter| {
            if f.kind == Kind::Or {
                format!("({})", f.expr)
            } else {
                f.expr.clone()
            }
        };
        Filter {
            expr: format!("{};{}", wrap(&self), wrap(&other)),
            kind: Kind::And,
        }
    }

    /// Either side may match (`,`).
    pub fn or(self, other: Filter) -> Filter {
        Filter {
            expr: format!("{},{}", self.expr, other.expr),
            kind: Kind::Or,
        }
    }

    /// The RSQL expression string to send as the `filter` query param.
    pub fn build(self) -> String {
        self.expr
    }

    /// The expression without consuming the filter.
    pub fn as_str(&self) -> &str {
        &self.expr
    }
}

impl fmt::Display for Filter {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.expr)
    }
}

impl From<Filter> for String {
    fn from(f: Filter) -> Self {
        f.expr
    }
}

#[cfg(test)]
mod tests {
    use super::Filter;

    #[test]
    fn eq_bare_and_quoted() {
        assert_eq!(
            Filter::eq("artist", "Radiohead").build(),
            "artist==Radiohead"
        );
        assert_eq!(
            Filter::eq("artist", "Daft Punk").build(),
            "artist==\"Daft Punk\""
        );
    }

    #[test]
    fn eq_escapes_quotes_and_backslashes() {
        assert_eq!(
            Filter::eq("title", "He said \"hi\"").build(),
            "title==\"He said \\\"hi\\\"\""
        );
        assert_eq!(
            Filter::eq("title", "back\\slash").build(),
            "title==\"back\\\\slash\""
        );
    }

    #[test]
    fn wildcard_stays_unquoted() {
        assert_eq!(Filter::eq("artist", "Daft*").build(), "artist==Daft*");
    }

    #[test]
    fn ordered_comparisons() {
        assert_eq!(Filter::ne("artist", "Eminem").build(), "artist!=Eminem");
        assert_eq!(
            Filter::gt("duration", 200_000).build(),
            "duration=gt=200000"
        );
        assert_eq!(Filter::ge("year", 2000).build(), "year=ge=2000");
        assert_eq!(Filter::lt("trackNumber", 5).build(), "trackNumber=lt=5");
        assert_eq!(Filter::le("year", 1999).build(), "year=le=1999");
    }

    #[test]
    fn in_and_out_lists() {
        assert_eq!(
            Filter::is_in("genre", ["house", "electro"]).build(),
            "genre=in=(house,electro)"
        );
        assert_eq!(
            Filter::is_out("genre", ["hip hop"]).build(),
            "genre=out=(\"hip hop\")"
        );
    }

    #[test]
    #[should_panic]
    fn empty_in_panics() {
        let _ = Filter::is_in("genre", Vec::<String>::new());
    }

    #[test]
    fn null_checks() {
        assert_eq!(Filter::is_null("uri").build(), "uri==null");
        assert_eq!(Filter::is_not_null("uri").build(), "uri!=null");
    }

    #[test]
    fn and_or_combinators() {
        let a = || Filter::eq("artist", "Radiohead");
        let b = || Filter::gt("duration", 200_000);
        assert_eq!(a().and(b()).build(), "artist==Radiohead;duration=gt=200000");
        assert_eq!(
            a().or(Filter::eq("artist", "Muse")).build(),
            "artist==Radiohead,artist==Muse"
        );
    }

    #[test]
    fn or_inside_and_is_parenthesized() {
        let ab = Filter::eq("artist", "Radiohead").or(Filter::eq("artist", "Muse"));
        assert_eq!(
            ab.and(Filter::gt("duration", 200_000)).build(),
            "(artist==Radiohead,artist==Muse);duration=gt=200000"
        );
        let bc = Filter::eq("genre", "house").or(Filter::eq("genre", "electro"));
        assert_eq!(
            Filter::eq("artist", "Radiohead").and(bc).build(),
            "artist==Radiohead;(genre==house,genre==electro)"
        );
    }

    #[test]
    fn and_inside_or_is_not_parenthesized() {
        let f = Filter::eq("artist", "Radiohead")
            .and(Filter::gt("duration", 200_000))
            .or(Filter::eq("genre", "house"));
        assert_eq!(
            f.build(),
            "artist==Radiohead;duration=gt=200000,genre==house"
        );
    }

    #[test]
    fn dotted_fields_and_booleans() {
        assert_eq!(
            Filter::eq("track.artist", "Daft Punk").build(),
            "track.artist==\"Daft Punk\""
        );
        assert_eq!(Filter::eq("liked", true).build(), "liked==true");
    }
}
