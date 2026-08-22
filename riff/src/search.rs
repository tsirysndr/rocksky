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
pub fn contains(term: &str) -> String {
    let mut p = String::with_capacity(term.len() + 2);
    p.push('%');
    for c in term.chars() {
        if c == '%' || c == '_' || c == ESC {
            p.push(ESC);
        }
        p.push(c);
    }
    p.push('%');
    p
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

/// A search term as a `name_key` parameter: the maps store `lower(name)`, so
/// the term is lowered (and trimmed) on the way in and compared with plain `=`.
///
/// Equality is the deliberate semantic. Substring `ILIKE` over the 256M-row
/// tracks relation is a full 23G scan per query — that is the outage of
/// 2026-08-22, where every search held a pooled connection for minutes and the
/// pool starved. Exact match hits the sorted `*_names` maps, where zone maps
/// prune it to a handful of row groups. The fuzzy cases riff loses are exactly
/// the ones the Spotify proxy falls back on: a riff miss costs one Spotify
/// call, a riff scan cost the whole service.
/// Emitted as an escaped SQL *literal*, not a bound parameter, deliberately:
/// the bundled engine planned parameterized comparisons without scan pruning,
/// turning millisecond map lookups into multi-second scans (measured with
/// riff-sql). Escaping is quote-doubling; DuckDB standard strings give
/// backslashes no special meaning.
fn name_key(term: &str) -> String {
    lit(&term.trim().to_lowercase())
}

/// Any string as an escaped single-quoted SQL literal.
fn lit(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}

/// `ORDER BY` for a search over one of the `*_names` maps: all surviving rows
/// matched the name exactly, so popularity is the only rank that is left.
/// `row_id` breaks ties so paging is stable.
fn order_by(alias: &str) -> (String, Vec<Value>) {
    (
        format!("ORDER BY COALESCE({alias}.popularity, 0) DESC, {alias}.row_id"),
        Vec::new(),
    )
}

/// Semijoin from track rows to an artist-name list:
/// track -> track_artists_by_artist -> artist_names, every hop against a
/// relation sorted by the column being probed.
fn keys(terms: &[String]) -> String {
    terms
        .iter()
        .map(|t| name_key(t))
        .collect::<Vec<_>>()
        .join(",")
}

fn tracks_by_artist_names(terms: &[String]) -> String {
    format!(
        "t.row_id IN (SELECT ta.track_rowid FROM track_artists_by_artist ta \
         WHERE ta.artist_rowid IN (SELECT row_id FROM artist_names WHERE name_key IN ({})))",
        keys(terms)
    )
}

fn tracks_by_album_names(terms: &[String]) -> String {
    format!(
        "t.row_id IN (SELECT tr.row_id FROM tracks tr \
         WHERE tr.album_rowid IN (SELECT row_id FROM album_names WHERE name_key IN ({})))",
        keys(terms)
    )
}

fn albums_by_artist_names(terms: &[String]) -> String {
    format!(
        "al.row_id IN (SELECT aa.album_rowid FROM artist_albums_expanded aa \
         WHERE aa.artist_rowid IN (SELECT row_id FROM artist_names WHERE name_key IN ({})))",
        keys(terms)
    )
}

/// Predicates over `track_names t`.
pub fn tracks(q: &SearchQuery) -> Built {
    let mut sql = Vec::new();

    for term in &q.track {
        sql.push(format!("t.name_key = {}", name_key(term)));
    }

    // A loose term may be the title, a credited artist, or the album.
    for term in &q.free {
        sql.push(format!(
            "(t.name_key = {} OR {} OR {})",
            name_key(term),
            tracks_by_artist_names(std::slice::from_ref(term)),
            tracks_by_album_names(std::slice::from_ref(term))
        ));
    }

    if !q.artist.is_empty() {
        sql.push(tracks_by_artist_names(&q.artist));
    }

    for term in &q.album {
        sql.push(tracks_by_album_names(std::slice::from_ref(term)));
    }

    if let Some(isrc) = &q.isrc {
        sql.push(format!(
            "t.row_id IN (SELECT row_id FROM track_isrcs WHERE isrc_key = upper({}))",
            lit(isrc)
        ));
    }

    if let Some((from, to)) = q.year {
        sql.push(format!(
            "t.row_id IN (SELECT tr.row_id FROM tracks tr WHERE tr.album_rowid IN \
             (SELECT al2.row_id FROM albums al2 \
              WHERE TRY_CAST(substr(al2.release_date, 1, 4) AS INTEGER) BETWEEN {from} AND {to}))"
        ));
    }

    let (order_sql, order_params) = order_by("t");
    Built {
        where_sql: and(sql),
        where_params: Vec::new(),
        order_sql,
        order_params,
    }
}

/// Predicates over `artist_names a`.
pub fn artists(q: &SearchQuery) -> Built {
    let mut sql = Vec::new();

    for term in q.artist.iter().chain(q.free.iter()).chain(q.track.iter()) {
        sql.push(format!("a.name_key = {}", name_key(term)));
    }

    // Genres are short labels on a small relation, so this keeps substring
    // matching — `genre:rock` finding "indie rock" is the useful behavior and
    // costs nothing at this size.
    for term in &q.genre {
        sql.push(format!(
            "a.row_id IN (SELECT artist_rowid FROM artist_genres WHERE genre ILIKE {} ESCAPE '!')",
            lit(&contains(term))
        ));
    }

    let (order_sql, order_params) = order_by("a");
    Built {
        where_sql: and(sql),
        where_params: Vec::new(),
        order_sql,
        order_params,
    }
}

/// Predicates over `album_names al`.
pub fn albums(q: &SearchQuery) -> Built {
    let mut sql = Vec::new();

    for term in &q.album {
        sql.push(format!("al.name_key = {}", name_key(term)));
    }

    for term in &q.free {
        sql.push(format!(
            "(al.name_key = {} OR {})",
            name_key(term),
            albums_by_artist_names(std::slice::from_ref(term))
        ));
    }

    if !q.artist.is_empty() {
        sql.push(albums_by_artist_names(&q.artist));
    }

    if let Some(upc) = &q.upc {
        sql.push(format!(
            "al.row_id IN (SELECT row_id FROM albums WHERE upper(external_id_upc) = upper({}))",
            lit(upc)
        ));
    }

    if let Some((from, to)) = q.year {
        sql.push(format!(
            "al.row_id IN (SELECT row_id FROM albums \
             WHERE TRY_CAST(substr(release_date, 1, 4) AS INTEGER) BETWEEN {from} AND {to})"
        ));
    }

    let (order_sql, order_params) = order_by("al");
    Built {
        where_sql: and(sql),
        where_params: Vec::new(),
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
        assert_eq!(contains("50%_off"), "%50!%!_off%");
    }

    #[test]
    fn name_keys_are_lowered_and_trimmed() {
        assert_eq!(name_key("  Blue Monday "), "'blue monday'");
    }

    /// Wildcards carry no meaning under equality — a literal "%" can only match
    /// a track actually named "%".
    #[test]
    fn name_keys_keep_wildcards_literal() {
        assert_eq!(name_key("100%"), "'100%'");
    }

    /// The literal path is fed user input; embedded quotes must double, and
    /// backslashes pass through untouched (DuckDB standard strings).
    #[test]
    fn literals_escape_embedded_quotes() {
        assert_eq!(lit("it's"), "'it''s'");
        assert_eq!(name_key("Don't Stop"), "'don''t stop'");
        assert_eq!(lit(r"a\b"), r"'a\b'");
        assert_eq!(
            lit("'; DROP TABLE tracks; --"),
            "'''; DROP TABLE tracks; --'"
        );
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
