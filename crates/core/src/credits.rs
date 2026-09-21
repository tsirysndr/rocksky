//! Whether a track credits an artist.
//!
//! `artist_tracks` is not trustworthy on its own. The write paths resolve the
//! track and the artist from two separate lookups, and a track resolved
//! through the MBID/ISRC fallback can belong to someone else entirely — which
//! is how "Baby" by Cannons ended up among Slipknot's popular tracks. The
//! scrobbles stay correct, so only the junction is wrong, and every read over
//! it has to check the credit itself.
//!
//! `apps/api/src/lib/credits.ts` is the same rule in TypeScript; the two have
//! to agree, or an artist's page depends on which service answered it.

use unicode_normalization::char::is_combining_mark;
use unicode_normalization::UnicodeNormalization;

/// Whether either credited string names this artist.
///
/// Containment in *either* direction, never equality, because neither string
/// is canonical:
///
/// | `artists.name`        |     | `tracks.artist`             |               |
/// |-----------------------|-----|-----------------------------|---------------|
/// | `Princess Superstar`  | ⊂   | `Mason, Princess Superstar` | collaboration |
/// | `Nujabes / fat jon`   | ⊃   | `fat jon`                   | split credit  |
/// | `Slipknot`            | ⊘   | `Cannons`                   | stranger      |
pub fn credits(artist_name: &str, credited: &str, album_artist: &str) -> bool {
    let name = fold(artist_name);
    if name.is_empty() {
        return false;
    }
    [credited, album_artist]
        .into_iter()
        .map(fold)
        .any(|other| !other.is_empty() && (other.contains(&name) || name.contains(&other)))
}

/// Lowercased, without diacritics, with typographic punctuation flattened.
///
/// The same artist is spelled several ways across sources — "JAŸ-Z"/"JAY-Z",
/// "Jóhann Jóhannsson"/"Johann Johannsson", "8‐Bit"/"8-Bit" (U+2010 against a
/// hyphen). Folding them together costs nothing; treating them as different
/// artists drops real tracks off an artist's page.
///
/// Note this is deliberately not left to SQL: the production database folds
/// case for ASCII only, so `lower('SÄLEN')` comes back as `'sÄlen'` and
/// `ILIKE` follows the same rules.
pub fn fold(value: &str) -> String {
    let flattened: String = value
        .nfkd()
        .filter(|c| !is_combining_mark(*c))
        .map(|c| match c {
            '\u{2010}'..='\u{2015}' | '\u{2212}' => '-',
            '\u{2018}' | '\u{2019}' | '\u{02BC}' => '\'',
            '\u{201C}' | '\u{201D}' => '"',
            c if c.is_whitespace() => ' ',
            c => c,
        })
        .collect();

    flattened
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The stray junction row this exists for.
    #[test]
    fn a_track_by_someone_else_is_not_credited() {
        assert!(!credits("Slipknot", "Cannons", "Cannons"));
    }

    #[test]
    fn one_credit_among_several_still_counts() {
        assert!(credits(
            "Princess Superstar",
            "Mason, Princess Superstar",
            "Mason"
        ));
        assert!(credits("Slipknot", "Corey Taylor", "Slipknot"));
    }

    /// `artists.name` is sometimes the joint credit and `tracks.artist` one
    /// half of it, so containment has to hold in both directions.
    #[test]
    fn a_credit_shorter_than_the_name_still_counts() {
        assert!(credits("Nujabes / fat jon", "fat jon", "fat jon"));
    }

    #[test]
    fn spelling_differences_between_sources_are_folded_away() {
        assert!(credits("Sälen", "SÄLEN", "SÄLEN"));
        assert!(credits("JAŸ-Z", "JAY-Z", "JAY-Z"));
        assert!(credits(
            "Jóhann Jóhannsson",
            "Johann Johannsson",
            "Johann Johannsson"
        ));
        assert!(credits(
            "The 8-Bit Big Band",
            "The 8\u{2010}Bit Big Band",
            "The 8\u{2010}Bit Big Band"
        ));
    }

    #[test]
    fn an_empty_name_credits_nothing() {
        assert!(!credits("  ", "Cannons", "Cannons"));
        assert!(!credits("Slipknot", "", ""));
    }

    #[test]
    fn folding_normalises_case_marks_punctuation_and_spacing() {
        assert_eq!(fold("Sigur Rós"), "sigur ros");
        assert_eq!(fold(" Guns \u{2019}n\u{2019}  Roses "), "guns 'n' roses");
        assert_eq!(fold("8\u{2010}Bit"), "8-bit");
    }
}
