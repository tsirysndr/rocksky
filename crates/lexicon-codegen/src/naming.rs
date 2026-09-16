//! Turning lexicon names into Rust names.
//!
//! This is where a generator quietly goes wrong, so each rule is spelled out
//! and tested rather than left to a general-purpose case converter:
//!
//! | lexicon                                  | Rust                                    |
//! |------------------------------------------|-----------------------------------------|
//! | `app.rocksky.actor.getActorSongs`        | module `app::rocksky::actor::get_actor_songs` |
//! | `songViewBasic` (a def)                  | struct `SongViewBasic`                  |
//! | `albumArtUrl` (a property)               | field `album_art_url`                   |
//! | `$type`                                  | field `type_`, renamed back            |
//! | `ref`, `type`, `self` (properties)       | field `ref_`, `type_`, `self_`         |
//! | `app.rocksky.song.defs#songViewBasic`    | `super::super::song::defs::SongViewBasic` |
//!
//! The awkward cases are real: `mbId` must become `mb_id` and not `mb_id`
//! via `m_b_id`; `albumArtUrl` must not become `album_art_u_r_l`; and a
//! property called `type` cannot be a field name at all.

/// Rust keywords that cannot be field or module names.
///
/// The full reserved list, including the ones reserved for future use, because
/// a lexicon is free to use any of them and a generated file that fails to
/// compile is worse than an ugly name.
const KEYWORDS: &[&str] = &[
    "as", "async", "await", "break", "const", "continue", "crate", "dyn", "else", "enum", "extern",
    "false", "fn", "for", "if", "impl", "in", "let", "loop", "match", "mod", "move", "mut", "pub",
    "ref", "return", "self", "static", "struct", "super", "trait", "true", "type", "unsafe", "use",
    "where", "while", "abstract", "become", "box", "do", "final", "macro", "override", "priv",
    "try", "typeof", "unsized", "virtual", "yield",
];

/// `camelCase` or `PascalCase` to `snake_case`.
///
/// Runs of capitals are treated as one word, so `albumArtURL` becomes
/// `album_art_url` rather than `album_art_u_r_l`, and a capital followed by a
/// lowercase starts a new word, so `mbId` becomes `mb_id`.
pub fn snake_case(name: &str) -> String {
    let chars: Vec<char> = name.chars().collect();
    let mut out = String::with_capacity(name.len() + 4);

    for (index, character) in chars.iter().enumerate() {
        if *character == '_' || *character == '-' || *character == '.' {
            if !out.ends_with('_') && !out.is_empty() {
                out.push('_');
            }
            continue;
        }

        if character.is_uppercase() {
            let previous_is_lower = index > 0 && chars[index - 1].is_lowercase();
            let previous_is_digit = index > 0 && chars[index - 1].is_ascii_digit();
            // The end of a run of capitals, as in `URLPath` -> `url_path`.
            let next_is_lower = chars.get(index + 1).is_some_and(|next| next.is_lowercase());
            let previous_is_upper = index > 0 && chars[index - 1].is_uppercase();

            if (previous_is_lower || previous_is_digit || (previous_is_upper && next_is_lower))
                && !out.ends_with('_')
                && !out.is_empty()
            {
                out.push('_');
            }
            out.extend(character.to_lowercase());
        } else {
            out.push(*character);
        }
    }

    out
}

/// `snake_case` or `camelCase` to `PascalCase`.
pub fn pascal_case(name: &str) -> String {
    snake_case(name)
        .split('_')
        .filter(|part| !part.is_empty())
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().chain(chars).collect::<String>(),
                None => String::new(),
            }
        })
        .collect()
}

/// A name safe to use as a Rust identifier.
///
/// Keywords gain a trailing underscore, and a name starting with a digit gains
/// a leading one. The original is preserved on the wire by a `serde(rename)`,
/// which [`needs_rename`] decides.
pub fn field_ident(property: &str) -> String {
    // `$type` is the one lexicon name with a sigil; it appears on every record.
    let base = snake_case(property.trim_start_matches('$'));

    if KEYWORDS.contains(&base.as_str()) {
        return format!("{base}_");
    }
    if base.chars().next().is_some_and(|c| c.is_ascii_digit()) {
        return format!("_{base}");
    }
    if base.is_empty() {
        return "field".to_string();
    }
    base
}

/// serde's own `rename_all = "camelCase"` transformation.
///
/// Modelled exactly, because [`needs_rename`] has to know what serde will do
/// on its own: emitting a redundant `rename` is noise, and *omitting* a needed
/// one silently changes the wire format.
///
/// serde splits the field name on `_`, keeps the first segment as-is and
/// capitalizes the first character of each later one. So `album_art` becomes
/// `albumArt`, and a trailing underscore contributes nothing — `type_` becomes
/// `type`.
pub fn serde_camel_case(ident: &str) -> String {
    let mut parts = ident.split('_');
    let mut out = parts.next().unwrap_or_default().to_string();
    for part in parts {
        let mut chars = part.chars();
        if let Some(first) = chars.next() {
            out.extend(first.to_uppercase());
            out.push_str(chars.as_str());
        }
    }
    out
}

/// Whether a `serde(rename)` is needed to get `property` back on the wire.
///
/// True when `rename_all = "camelCase"` applied to the Rust identifier would
/// *not* reproduce the lexicon's property name. Both directions matter:
///
/// | property     | ident       | serde gives | rename? |
/// |--------------|-------------|-------------|---------|
/// | `albumArt`   | `album_art` | `albumArt`  | no      |
/// | `mbId`       | `mb_id`     | `mbId`      | no      |
/// | `sha256`     | `sha256`    | `sha256`    | no      |
/// | `album_art`  | `album_art` | `albumArt`  | **yes** |
/// | `albumArtURL`| `album_art_url` | `albumArtUrl` | **yes** |
/// | `$type`      | `type_`     | `type`      | **yes** |
/// | `type`       | `type_`     | `type`      | no      |
///
/// The `album_art` row is the one that matters most: a lexicon property that
/// is already snake_case would be silently renamed to camelCase by
/// `rename_all`, so it needs an explicit rename to stay as written.
pub fn needs_rename(property: &str) -> bool {
    serde_camel_case(&field_ident(property)) != property
}

/// A module name for one NSID segment.
pub fn module_ident(segment: &str) -> String {
    let base = snake_case(segment);
    if KEYWORDS.contains(&base.as_str()) {
        format!("{base}_")
    } else {
        base
    }
}

/// The type name for a def.
///
/// `main` is not a usable type name, so the caller supplies what it means in
/// context — `Parameters`, `Output`, or the record's own name.
pub fn type_ident(def_name: &str) -> String {
    pascal_case(def_name)
}

/// The module path an NSID maps to, as segments.
///
/// `app.rocksky.actor.getActorSongs` becomes
/// `["app", "rocksky", "actor", "get_actor_songs"]`, so the generated tree
/// mirrors the lexicon tree and a file is where its NSID says it is.
pub fn module_path(nsid: &str) -> Vec<String> {
    nsid.split('.').map(module_ident).collect()
}

/// A record's type name, taken from the last segment of its NSID.
///
/// `app.rocksky.scrobble` gives `Scrobble`; `app.rocksky.actor.status` gives
/// `Status`.
pub fn record_ident(nsid: &str) -> String {
    pascal_case(nsid.rsplit('.').next().unwrap_or(nsid))
}

/// A parsed `ref` target.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Reference {
    /// `None` for a local `#def` reference.
    pub nsid: Option<String>,
    pub def: String,
}

/// Splits `nsid#def`, `#def` or a bare `nsid` (which means its `main` def).
pub fn parse_ref(target: &str) -> Reference {
    match target.split_once('#') {
        Some(("", def)) => Reference {
            nsid: None,
            def: def.to_string(),
        },
        Some((nsid, def)) => Reference {
            nsid: Some(nsid.to_string()),
            def: def.to_string(),
        },
        // A ref with no fragment points at the document's `main`.
        None => Reference {
            nsid: Some(target.to_string()),
            def: "main".to_string(),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn camel_case_becomes_snake_case() {
        assert_eq!(snake_case("albumArtist"), "album_artist");
        assert_eq!(snake_case("title"), "title");
        assert_eq!(snake_case("trackNumber"), "track_number");
        assert_eq!(snake_case("SongViewBasic"), "song_view_basic");
    }

    /// The cases a naive converter gets wrong.
    #[test]
    fn runs_of_capitals_are_one_word() {
        // Not `m_b_id`.
        assert_eq!(snake_case("mbId"), "mb_id");
        // Not `album_art_u_r_l`.
        assert_eq!(snake_case("albumArtURL"), "album_art_url");
        assert_eq!(snake_case("ISRC"), "isrc");
        // A capital run followed by a lowercase splits before the last capital.
        assert_eq!(snake_case("URLPath"), "url_path");
        assert_eq!(snake_case("appleMusicLink"), "apple_music_link");
    }

    #[test]
    fn digits_start_a_new_word() {
        assert_eq!(snake_case("sha256"), "sha256");
        assert_eq!(snake_case("top10Tracks"), "top10_tracks");
    }

    #[test]
    fn separators_collapse() {
        assert_eq!(snake_case("album_art"), "album_art");
        assert_eq!(snake_case("album-art"), "album_art");
        assert_eq!(snake_case("album__art"), "album_art");
    }

    #[test]
    fn pascal_case_round_trips() {
        assert_eq!(pascal_case("songViewBasic"), "SongViewBasic");
        assert_eq!(pascal_case("song_view_basic"), "SongViewBasic");
        assert_eq!(pascal_case("main"), "Main");
        assert_eq!(pascal_case("mbId"), "MbId");
    }

    /// A property named after a keyword must still produce a compilable
    /// field.
    #[test]
    fn keywords_are_escaped() {
        assert_eq!(field_ident("type"), "type_");
        assert_eq!(field_ident("ref"), "ref_");
        assert_eq!(field_ident("self"), "self_");
        assert_eq!(field_ident("match"), "match_");

        // And they need *no* explicit rename: serde's camelCase drops the
        // trailing underscore, so `type_` already goes on the wire as `type`.
        assert!(!needs_rename("type"));
        assert!(!needs_rename("ref"));
    }

    /// `$type` appears on every record.
    #[test]
    fn the_type_sigil_is_stripped_and_renamed() {
        assert_eq!(field_ident("$type"), "type_");
        assert!(needs_rename("$type"));
    }

    #[test]
    fn a_leading_digit_gains_an_underscore() {
        assert_eq!(field_ident("2fa"), "_2fa");
        // serde strips the leading underscore's empty segment, so this too
        // round-trips without help.
        assert!(!needs_rename("2fa"));
    }

    #[test]
    fn serde_camel_case_matches_serdes_own_rule() {
        assert_eq!(serde_camel_case("album_art"), "albumArt");
        assert_eq!(serde_camel_case("mb_id"), "mbId");
        assert_eq!(serde_camel_case("title"), "title");
        assert_eq!(serde_camel_case("sha256"), "sha256");
        // A trailing underscore contributes nothing, which is what makes
        // keyword-escaped idents round-trip.
        assert_eq!(serde_camel_case("type_"), "type");
        assert_eq!(serde_camel_case("_2fa"), "2fa");
    }

    /// A rename is emitted only when `rename_all = "camelCase"` would get the
    /// wire name wrong — in *either* direction.
    #[test]
    fn a_rename_is_emitted_only_when_serde_needs_one() {
        // `rename_all` already produces these.
        for property in ["title", "albumArt", "mbId", "sha256", "trackNumber", "type"] {
            assert!(
                !needs_rename(property),
                "{property} should not need an explicit rename"
            );
        }

        // A lexicon property that is already snake_case *does* need one, or
        // `rename_all` would silently camelCase it on the wire. This is the
        // case a naive `ident != property` check gets backwards.
        assert!(needs_rename("album_art"));

        // A run of capitals does not survive the round trip.
        assert!(needs_rename("albumArtURL"));

        // And the sigil on `$type` cannot be reconstructed.
        assert!(needs_rename("$type"));
    }

    #[test]
    fn an_nsid_becomes_a_module_path() {
        assert_eq!(
            module_path("app.rocksky.actor.getActorSongs"),
            ["app", "rocksky", "actor", "get_actor_songs"]
        );
        assert_eq!(
            module_path("app.rocksky.song.defs"),
            ["app", "rocksky", "song", "defs"]
        );
    }

    /// An NSID segment that collides with a keyword must not produce an
    /// uncompilable module.
    #[test]
    fn a_keyword_segment_is_escaped_in_the_path() {
        assert_eq!(module_path("com.example.type.thing")[2], "type_");
    }

    #[test]
    fn a_record_is_named_after_its_last_segment() {
        assert_eq!(record_ident("app.rocksky.scrobble"), "Scrobble");
        assert_eq!(record_ident("app.rocksky.actor.status"), "Status");
        assert_eq!(record_ident("app.rocksky.playlist.song"), "Song");
    }

    #[test]
    fn refs_split_into_document_and_def() {
        assert_eq!(
            parse_ref("app.rocksky.song.defs#songViewBasic"),
            Reference {
                nsid: Some("app.rocksky.song.defs".into()),
                def: "songViewBasic".into()
            }
        );
        assert_eq!(
            parse_ref("#songViewBasic"),
            Reference {
                nsid: None,
                def: "songViewBasic".into()
            }
        );
    }

    /// A ref with no fragment means the document's `main`, which is how
    /// records are referenced.
    #[test]
    fn a_ref_without_a_fragment_means_main() {
        assert_eq!(
            parse_ref("app.rocksky.scrobble"),
            Reference {
                nsid: Some("app.rocksky.scrobble".into()),
                def: "main".into()
            }
        );
    }
}

/// Proves [`serde_camel_case`] matches what serde actually does.
///
/// The whole rename decision rests on this model being right, and a wrong
/// model is invisible — it produces types that compile and silently use the
/// wrong wire names. So the real `rename_all` is applied to structs whose
/// field names are the awkward cases, and the resulting JSON keys are compared
/// against the model's prediction.
#[cfg(test)]
mod serde_agreement {
    use super::serde_camel_case;
    use serde::Serialize;

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Awkward {
        title: i32,
        album_art: i32,
        mb_id: i32,
        sha256: i32,
        album_art_url: i32,
        type_: i32,
        _2fa: i32,
    }

    #[test]
    fn the_model_agrees_with_serde() {
        let value = serde_json::to_value(Awkward {
            title: 0,
            album_art: 0,
            mb_id: 0,
            sha256: 0,
            album_art_url: 0,
            type_: 0,
            _2fa: 0,
        })
        .unwrap();

        let actual: Vec<String> = value
            .as_object()
            .expect("an object")
            .keys()
            .cloned()
            .collect();

        // What serde produced, against what the model predicts for the same
        // identifiers.
        for (ident, produced) in [
            "title",
            "album_art",
            "mb_id",
            "sha256",
            "album_art_url",
            "type_",
            "_2fa",
        ]
        .iter()
        .zip(&actual)
        {
            assert_eq!(
                serde_camel_case(ident),
                *produced,
                "the model disagrees with serde for `{ident}`"
            );
        }
    }
}
