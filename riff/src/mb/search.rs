//! Lucene-lite parsing for `?query=`.
//!
//! Rocksky's clients send queries like
//! `recording:"Blue Monday" AND artist:"New Order" AND status:Official` and
//! `album:"Power, Corruption & Lies"`. This parser handles that dialect:
//! `field:"quoted"` / `field:bare` clauses plus bare terms, with `AND`/`OR`
//! connectives treated as AND and `NOT` clauses dropped. Anything fancier
//! (ranges, boosts, wildcards) is not something Rocksky emits.
//!
//! Matching downstream is EXACT (case-insensitive), like riff's Spotify
//! search and for the same reason: fuzzy matching over millions of rows is a
//! full scan per query. The rate-limited upstream remains the fallback for
//! fuzzy needs.

#[derive(Debug, Default, PartialEq)]
pub struct Query {
    /// Terms that must match the entity's own name/title (or an alias).
    pub name: Vec<String>,
    /// `artist:` / `artistname:` clauses — matched against artist-credit names
    /// (or, on the artist entity itself, its name).
    pub artist: Vec<String>,
    /// `arid:` clauses — artist MBIDs.
    pub arid: Vec<String>,
    /// `isrc:` clauses.
    pub isrc: Vec<String>,
    /// `rgid:` / entity-id clauses.
    pub id: Vec<String>,
    /// `type:` / `primarytype:` clauses.
    pub kind: Vec<String>,
}

impl Query {
    pub fn is_empty(&self) -> bool {
        self.name.is_empty()
            && self.artist.is_empty()
            && self.arid.is_empty()
            && self.isrc.is_empty()
            && self.id.is_empty()
            && self.kind.is_empty()
    }
}

/// One `field:value` or bare term.
fn push(query: &mut Query, field: Option<&str>, value: String) {
    if value.is_empty() {
        return;
    }
    match field.map(|f| f.to_ascii_lowercase()).as_deref() {
        // The entity's own name, whatever the caller called it. `release` is
        // accepted for release-group searches since clients use it loosely.
        None
        | Some("recording" | "release" | "releasegroup" | "release-group" | "work")
        | Some("area" | "label" | "place" | "event" | "instrument" | "title" | "name")
        | Some("alias") => query.name.push(value),
        Some("artist" | "artistname" | "creditname") => query.artist.push(value),
        Some("arid") => query.arid.push(value),
        Some("isrc") => query.isrc.push(value.to_ascii_uppercase()),
        Some("rgid" | "rid" | "reid" | "wid" | "aid") => query.id.push(value),
        Some("type" | "primarytype" | "primary-type") => query.kind.push(value),
        // `status:`, `country:`, `tag:`, dates… — accepted and ignored. The
        // dump has no releases, so `status:Official` cannot narrow anything;
        // dropping the clause beats returning nothing.
        Some(_) => {}
    }
}

/// Special-case: on the artist entity, `artist:"X"` means the name itself.
pub fn parse_for(entity: &str, raw: &str) -> Query {
    let mut q = parse(raw);
    if entity == "artist" {
        q.name.append(&mut q.artist);
    }
    q
}

pub fn parse(raw: &str) -> Query {
    let mut query = Query::default();
    let mut chars = raw.chars().peekable();
    let mut field: Option<String> = None;
    let mut token = String::new();
    let mut negated = false;

    let flush =
        |query: &mut Query, field: &mut Option<String>, token: &mut String, negated: &mut bool| {
            let word = std::mem::take(token);
            let f = field.take();
            let neg = std::mem::take(negated);
            match word.as_str() {
                "" | "AND" | "OR" | "&&" | "||" => {}
                "NOT" | "!" | "-" => {} // negation handled at capture time
                _ if neg => {}          // drop negated clauses entirely
                _ => push(query, f.as_deref(), word),
            }
        };

    while let Some(c) = chars.next() {
        match c {
            '"' => {
                let mut value = String::new();
                while let Some(c) = chars.next() {
                    match c {
                        '\\' => {
                            if let Some(escaped) = chars.next() {
                                value.push(escaped);
                            }
                        }
                        '"' => break,
                        _ => value.push(c),
                    }
                }
                if !negated {
                    push(&mut query, field.take().as_deref(), value);
                } else {
                    field = None;
                    negated = false;
                }
            }
            ':' if !token.is_empty() && field.is_none() => {
                field = Some(std::mem::take(&mut token));
            }
            '(' | ')' => flush(&mut query, &mut field, &mut token, &mut negated),
            c if c.is_whitespace() => {
                if token == "NOT" {
                    token.clear();
                    negated = true;
                } else {
                    flush(&mut query, &mut field, &mut token, &mut negated);
                }
            }
            '-' | '!' if token.is_empty() && field.is_none() => negated = true,
            '\\' => {
                if let Some(escaped) = chars.next() {
                    token.push(escaped);
                }
            }
            _ => token.push(c),
        }
    }
    flush(&mut query, &mut field, &mut token, &mut negated);
    query
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scrobbler_query() {
        let q = parse(r#"recording:"So What" AND artist:"Miles Davis" AND status:Official"#);
        assert_eq!(q.name, vec!["So What"]);
        assert_eq!(q.artist, vec!["Miles Davis"]);
        assert!(q.isrc.is_empty());
    }

    #[test]
    fn bare_terms_and_fields() {
        let q = parse(r#"blue monday artist:"New Order""#);
        assert_eq!(q.name, vec!["blue", "monday"]);
        assert_eq!(q.artist, vec!["New Order"]);
    }

    #[test]
    fn isrc_uppercased() {
        let q = parse("isrc:ussm18900468");
        assert_eq!(q.isrc, vec!["USSM18900468"]);
    }

    #[test]
    fn escaped_quote_inside_phrase() {
        let q = parse(r#"recording:"Don\"t Stop""#);
        assert_eq!(q.name, vec![r#"Don"t Stop"#]);
    }

    #[test]
    fn negated_clauses_dropped() {
        let q = parse(r#"recording:"Help" NOT artist:"Nobody" -type:live"#);
        assert_eq!(q.name, vec!["Help"]);
        assert!(q.artist.is_empty());
        assert!(q.kind.is_empty());
    }

    #[test]
    fn artist_entity_maps_artist_field_to_name() {
        let q = parse_for("artist", r#"artist:"Daft Punk""#);
        assert_eq!(q.name, vec!["Daft Punk"]);
    }
}
