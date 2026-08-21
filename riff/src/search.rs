//! Parsing and SQL generation for `GET /v1/search`.
//!
//! Callers in this repo do not send bare keywords — `apps/api`'s `matchSong`
//! builds `q=track:"Some Title" artist:"Some Artist"&type=track`, sometimes with
//! several `artist:` filters. So the field-filter grammar is the primary path,
//! not a nicety.

use duckdb::types::Value;

/// The escape character for `ILIKE`. `!` rather than `\` so the SQL literal
/// (`ESCAPE '!'`) needs no backslash handling of its own.
const ESC: char = '!';

#[derive(Debug, Default, PartialEq, Eq)]
pub struct SearchQuery {
    /// Terms with no `field:` prefix. Each must match *something* (name, artist
    /// or album), mirroring how Spotify treats loose keywords.
    pub free: Vec<String>,
    pub track: Vec<String>,
    pub artist: Vec<String>,
    pub album: Vec<String>,
    pub genre: Vec<String>,
    pub isrc: Option<String>,
    pub upc: Option<String>,
    /// Inclusive `[from, to]`; `year:2019` yields `(2019, 2019)`.
    pub year: Option<(i32, i32)>,
}

impl SearchQuery {
    pub fn is_empty(&self) -> bool {
        self.free.is_empty()
            && self.track.is_empty()
            && self.artist.is_empty()
            && self.album.is_empty()
            && self.genre.is_empty()
            && self.isrc.is_none()
            && self.upc.is_none()
            && self.year.is_none()
    }

    /// The term used for the "exact title match sorts first" boost.
    fn primary(&self) -> Option<&str> {
        self.track
            .first()
            .or_else(|| self.free.first())
            .map(String::as_str)
    }
}

/// Splits a Spotify query string into field filters and loose terms.
///
/// Understands `field:bare`, `field:"quoted value"`, bare words and `"quoted
/// phrases"`. An unrecognized field is kept verbatim as a loose term rather
/// than dropped, so `foo:bar` still searches for the literal text.
pub fn parse(q: &str) -> SearchQuery {
    let chars: Vec<char> = q.chars().collect();
    let mut out = SearchQuery::default();
    let mut i = 0;

    while i < chars.len() {
        if chars[i].is_whitespace() {
            i += 1;
            continue;
        }

        let start = i;
        let mut field: Option<String> = None;

        // Consume a bare word, stopping at the first ':' (which makes the text
        // so far a field name) or at whitespace.
        if chars[i] != '"' {
            while i < chars.len() && !chars[i].is_whitespace() {
                if chars[i] == ':' && i > start {
                    field = Some(chars[start..i].iter().collect::<String>().to_lowercase());
                    i += 1;
                    break;
                }
                i += 1;
            }
        }

        let value: String = if i < chars.len() && chars[i] == '"' {
            i += 1;
            let vs = i;
            while i < chars.len() && chars[i] != '"' {
                i += 1;
            }
            let v = chars[vs..i].iter().collect();
            if i < chars.len() {
                i += 1; // closing quote
            }
            v
        } else {
            let vs = if field.is_some() { i } else { start };
            while i < chars.len() && !chars[i].is_whitespace() {
                i += 1;
            }
            chars[vs..i].iter().collect()
        };

        let value = value.trim().to_string();
        if value.is_empty() {
            continue;
        }

        match field.as_deref() {
            Some("track") | Some("title") => out.track.push(value),
            Some("artist") => out.artist.push(value),
            Some("album") => out.album.push(value),
            Some("genre") => out.genre.push(value),
            Some("isrc") => out.isrc = Some(value),
            Some("upc") => out.upc = Some(value),
            Some("year") => out.year = parse_year(&value),
            // `tag:new` / `tag:hipster` have no equivalent in the dump. Dropping
            // them is right: keeping them as loose text would match nothing and
            // turn an otherwise good query into zero results.
            Some("tag") => {}
            Some(other) => out.free.push(format!("{other}:{value}")),
            None => out.free.push(value),
        }
    }

    out
}

fn parse_year(v: &str) -> Option<(i32, i32)> {
    match v.split_once('-') {
        Some((a, b)) => Some((a.trim().parse().ok()?, b.trim().parse().ok()?)),
        None => {
            let y = v.trim().parse().ok()?;
            Some((y, y))
        }
    }
}

/// Wraps a user term for a substring `ILIKE`, neutralizing the wildcards a
/// track title may legitimately contain (`%`, `_`).
pub fn contains(term: &str) -> Value {
    let mut p = String::with_capacity(term.len() + 2);
    p.push('%');
    for c in term.chars() {
        if c == '%' || c == '_' || c == ESC {
            p.push(ESC);
        }
        p.push(c);
    }
    p.push('%');
    Value::Text(p)
}

pub struct Predicate {
    pub sql: String,
    pub params: Vec<Value>,
}

pub struct Built {
    pub where_sql: String,
    pub where_params: Vec<Value>,
    pub order_sql: String,
    pub order_params: Vec<Value>,
}

fn and(parts: Vec<String>) -> String {
    if parts.is_empty() {
        "TRUE".to_string()
    } else {
        parts.join(" AND ")
    }
}

/// Sorts an exact (case-insensitive) title match ahead of everything else, then
/// falls back to popularity. Without the boost, searching a common title
/// returns whatever the scan happened to hit first.
fn order_by(primary: Option<&str>, name_col: &str, pop_col: &str) -> (String, Vec<Value>) {
    match primary {
        Some(term) => (
            format!("ORDER BY (lower({name_col}) = lower(?)) DESC, COALESCE({pop_col}, 0) DESC"),
            vec![Value::Text(term.to_string())],
        ),
        None => (format!("ORDER BY COALESCE({pop_col}, 0) DESC"), Vec::new()),
    }
}

/// `EXISTS` over the artists credited on a track. Multiple `artist:` filters are
/// OR'd: `matchSong` sends every credited artist it knows about, and a track
/// whose row only carries the primary artist would fail an AND.
fn track_artist_exists(filters: &[String]) -> Option<Predicate> {
    if filters.is_empty() {
        return None;
    }
    let ors = vec![format!("ar.name ILIKE ? ESCAPE '{ESC}'"); filters.len()].join(" OR ");
    Some(Predicate {
        sql: format!(
            "EXISTS (SELECT 1 FROM track_artists ta JOIN artists ar ON ar.row_id = ta.artist_rowid \
             WHERE ta.track_rowid = t.row_id AND ({ors}))"
        ),
        params: filters.iter().map(|f| contains(f)).collect(),
    })
}

fn album_artist_exists(filters: &[String], album_col: &str) -> Option<Predicate> {
    if filters.is_empty() {
        return None;
    }
    let ors = vec![format!("ar.name ILIKE ? ESCAPE '{ESC}'"); filters.len()].join(" OR ");
    Some(Predicate {
        sql: format!(
            "EXISTS (SELECT 1 FROM artist_albums aa JOIN artists ar ON ar.row_id = aa.artist_rowid \
             WHERE aa.album_rowid = {album_col} AND ({ors}))"
        ),
        params: filters.iter().map(|f| contains(f)).collect(),
    })
}

fn year_between(year: Option<(i32, i32)>, release_col: &str) -> Option<Predicate> {
    let (from, to) = year?;
    Some(Predicate {
        sql: format!("TRY_CAST(substr({release_col}, 1, 4) AS INTEGER) BETWEEN ? AND ?"),
        params: vec![Value::Int(from), Value::Int(to)],
    })
}

/// Predicates over `tracks t`.
pub fn tracks(q: &SearchQuery) -> Built {
    let mut sql = Vec::new();
    let mut params = Vec::new();

    for term in &q.track {
        sql.push(format!("t.name ILIKE ? ESCAPE '{ESC}'"));
        params.push(contains(term));
    }

    // A loose term may land on the title, a credited artist, or the album.
    for term in &q.free {
        sql.push(format!(
            "(t.name ILIKE ? ESCAPE '{ESC}' \
             OR EXISTS (SELECT 1 FROM track_artists ta JOIN artists ar ON ar.row_id = ta.artist_rowid \
                        WHERE ta.track_rowid = t.row_id AND ar.name ILIKE ? ESCAPE '{ESC}') \
             OR EXISTS (SELECT 1 FROM albums al WHERE al.row_id = t.album_rowid \
                        AND al.name ILIKE ? ESCAPE '{ESC}'))"
        ));
        params.extend([contains(term), contains(term), contains(term)]);
    }

    if let Some(p) = track_artist_exists(&q.artist) {
        sql.push(p.sql);
        params.extend(p.params);
    }

    for term in &q.album {
        sql.push(format!(
            "EXISTS (SELECT 1 FROM albums al WHERE al.row_id = t.album_rowid AND al.name ILIKE ? ESCAPE '{ESC}')"
        ));
        params.push(contains(term));
    }

    if let Some(isrc) = &q.isrc {
        sql.push("upper(t.external_id_isrc) = upper(?)".to_string());
        params.push(Value::Text(isrc.clone()));
    }

    if let Some(p) = year_between(q.year, "al.release_date") {
        sql.push(format!(
            "EXISTS (SELECT 1 FROM albums al WHERE al.row_id = t.album_rowid AND {})",
            p.sql
        ));
        params.extend(p.params);
    }

    let (order_sql, order_params) = order_by(q.primary(), "t.name", "t.popularity");
    Built {
        where_sql: and(sql),
        where_params: params,
        order_sql,
        order_params,
    }
}

/// Predicates over `artists a`.
pub fn artists(q: &SearchQuery) -> Built {
    let mut sql = Vec::new();
    let mut params = Vec::new();

    for term in q.artist.iter().chain(q.free.iter()).chain(q.track.iter()) {
        sql.push(format!("a.name ILIKE ? ESCAPE '{ESC}'"));
        params.push(contains(term));
    }

    for term in &q.genre {
        sql.push(format!(
            "EXISTS (SELECT 1 FROM artist_genres ag WHERE ag.artist_rowid = a.row_id \
             AND ag.genre ILIKE ? ESCAPE '{ESC}')"
        ));
        params.push(contains(term));
    }

    let primary = q
        .artist
        .first()
        .or_else(|| q.free.first())
        .map(String::as_str);
    let (order_sql, order_params) = order_by(primary, "a.name", "a.popularity");
    Built {
        where_sql: and(sql),
        where_params: params,
        order_sql,
        order_params,
    }
}

/// Predicates over `albums al`.
pub fn albums(q: &SearchQuery) -> Built {
    let mut sql = Vec::new();
    let mut params = Vec::new();

    for term in &q.album {
        sql.push(format!("al.name ILIKE ? ESCAPE '{ESC}'"));
        params.push(contains(term));
    }

    for term in &q.free {
        sql.push(format!(
            "(al.name ILIKE ? ESCAPE '{ESC}' \
             OR EXISTS (SELECT 1 FROM artist_albums aa JOIN artists ar ON ar.row_id = aa.artist_rowid \
                        WHERE aa.album_rowid = al.row_id AND ar.name ILIKE ? ESCAPE '{ESC}'))"
        ));
        params.extend([contains(term), contains(term)]);
    }

    if let Some(p) = album_artist_exists(&q.artist, "al.row_id") {
        sql.push(p.sql);
        params.extend(p.params);
    }

    if let Some(upc) = &q.upc {
        sql.push("upper(al.external_id_upc) = upper(?)".to_string());
        params.push(Value::Text(upc.clone()));
    }

    if let Some(p) = year_between(q.year, "al.release_date") {
        sql.push(p.sql);
        params.extend(p.params);
    }

    let primary = q
        .album
        .first()
        .or_else(|| q.free.first())
        .map(String::as_str);
    let (order_sql, order_params) = order_by(primary, "al.name", "al.popularity");
    Built {
        where_sql: and(sql),
        where_params: params,
        order_sql,
        order_params,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The exact shape `apps/api`'s matchSong sends once actix has percent-decoded it.
    #[test]
    fn parses_match_song_query() {
        let q = parse(r#"track:"Blue Monday" artist:"New Order""#);
        assert_eq!(q.track, vec!["Blue Monday"]);
        assert_eq!(q.artist, vec!["New Order"]);
        assert!(q.free.is_empty());
    }

    #[test]
    fn parses_repeated_artist_filters() {
        let q = parse(r#"track:"Numb" artist:"Linkin Park" artist:"Jay-Z""#);
        assert_eq!(q.track, vec!["Numb"]);
        assert_eq!(q.artist, vec!["Linkin Park", "Jay-Z"]);
    }

    #[test]
    fn parses_bare_and_quoted_free_text() {
        let q = parse(r#"daft punk "get lucky""#);
        assert_eq!(q.free, vec!["daft", "punk", "get lucky"]);
    }

    #[test]
    fn parses_unquoted_field_values() {
        let q = parse("artist:radiohead year:1997");
        assert_eq!(q.artist, vec!["radiohead"]);
        assert_eq!(q.year, Some((1997, 1997)));
    }

    #[test]
    fn parses_year_ranges() {
        assert_eq!(parse("year:1990-1999").year, Some((1990, 1999)));
        assert_eq!(parse("year:nonsense").year, None);
    }

    #[test]
    fn keeps_unknown_fields_as_literal_text() {
        assert_eq!(parse("mood:sad").free, vec!["mood:sad"]);
    }

    #[test]
    fn drops_unsupported_tag_filter() {
        let q = parse("tag:new artist:Boards");
        assert!(q.free.is_empty());
        assert_eq!(q.artist, vec!["Boards"]);
    }

    #[test]
    fn escapes_like_wildcards_in_terms() {
        assert_eq!(contains("50%_off"), Value::Text("%50!%!_off%".into()));
    }

    #[test]
    fn empty_query_is_detected() {
        assert!(parse("   ").is_empty());
        assert!(!parse("hello").is_empty());
    }

    #[test]
    fn unterminated_quote_still_yields_the_term() {
        let q = parse(r#"track:"unclosed"#);
        assert_eq!(q.track, vec!["unclosed"]);
    }
}
