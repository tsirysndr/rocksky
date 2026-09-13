//! Musical keys and how they are written.
//!
//! Keys are stored and shown in **traditional notation** — `D`, `Fm`, `A#m` —
//! because that is what every other tool the user has open is showing, and two
//! tools disagreeing on the name of the same key is worse than either notation
//! is better. Camelot (`4A`, `10B`) is still parsed on the way in, because DJ
//! tools write it, and still produced on demand, because the wheel position is
//! what "these two tracks mix" means.

/// A musical key: a tonic, and whether it is major or minor.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Key {
    /// Pitch class, 0 = C.
    pub root: u8,
    pub is_major: bool,
}

/// Sharps rather than flats, chosen once so the same key is always written the
/// same way. Tags use both and either is accepted on the way in.
const NAMES: [&str; 12] = [
    "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
];

/// Position on the circle of fifths for each chromatic root, counting from C.
/// C major is 8B, so the table is anchored there.
const FIFTHS: [u8; 12] = [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1];

impl Key {
    /// Traditional notation: `D`, `Fm`.
    pub fn name(&self) -> String {
        format!(
            "{}{}",
            NAMES[(self.root % 12) as usize],
            if self.is_major { "" } else { "m" }
        )
    }

    /// Camelot notation: `10B`, `4A`.
    pub fn camelot(&self) -> String {
        format!(
            "{}{}",
            self.wheel_position(),
            if self.is_major { "B" } else { "A" }
        )
    }

    /// Where this key sits on the circle of fifths, 1..=12.
    ///
    /// A minor key shares its position with the major a minor third above —
    /// they share a key signature and mix freely, which is the whole reason the
    /// wheel is numbered this way.
    pub fn wheel_position(&self) -> u8 {
        let root = if self.is_major {
            self.root % 12
        } else {
            (self.root + 3) % 12
        };
        FIFTHS[root as usize]
    }

    /// Parse either notation. `None` for anything that is not a key — a wrong
    /// key is worse than none, because it gets acted on.
    pub fn parse(value: &str) -> Option<Key> {
        let value = value.trim();
        if value.is_empty() {
            return None;
        }
        from_camelot(value).or_else(|| from_traditional(value))
    }
}

fn from_camelot(value: &str) -> Option<Key> {
    let (number, letter) = value.split_at(value.len().checked_sub(1)?);
    let is_major = match letter {
        "B" | "b" => true,
        "A" | "a" => false,
        _ => return None,
    };
    let number: u8 = number.parse().ok()?;
    if !(1..=12).contains(&number) {
        return None;
    }

    // Invert the wheel table: find the root whose position is this number.
    let major_root = (0..12u8).find(|root| FIFTHS[*root as usize] == number)?;
    Some(Key {
        // A minor key's tonic is a minor third below its relative major's.
        root: if is_major {
            major_root
        } else {
            (major_root + 9) % 12
        },
        is_major,
    })
}

fn from_traditional(value: &str) -> Option<Key> {
    let mut chars = value.chars();
    let natural = match chars.next()?.to_ascii_uppercase() {
        'C' => 0,
        'D' => 2,
        'E' => 4,
        'F' => 5,
        'G' => 7,
        'A' => 9,
        'B' => 11,
        _ => return None,
    };

    let rest = chars.as_str();
    // Accidentals, in every spelling tags use.
    let (root, rest) = if let Some(rest) = rest.strip_prefix(['#', '♯']) {
        ((natural + 1) % 12, rest)
    } else if let Some(rest) = rest.strip_prefix(['b', '♭']) {
        // `b` after a letter is always a flat: no notation writes a mode as a
        // bare `b`, so there is nothing to be ambiguous with.
        ((natural + 11) % 12, rest)
    } else {
        (natural, rest)
    };

    // A bare letter means major, as every tool that writes one intends.
    let is_major = match rest.trim().to_ascii_lowercase().as_str() {
        "" | "maj" | "major" => true,
        "m" | "min" | "minor" => false,
        _ => return None,
    };

    Some(Key { root, is_major })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keys_are_named_the_way_every_other_tool_names_them() {
        assert_eq!(Key::parse("4A").unwrap().name(), "Fm");
        assert_eq!(Key::parse("10B").unwrap().name(), "D");
        assert_eq!(Key::parse("8A").unwrap().name(), "Am");
        assert_eq!(Key::parse("8B").unwrap().name(), "C");
    }

    /// Both notations name the same key, so parsing either must give the same
    /// thing — this is what lets a tag in either spelling be stored once.
    #[test]
    fn the_two_notations_round_trip() {
        for number in 1..=12u8 {
            for letter in ["A", "B"] {
                let camelot = format!("{number}{letter}");
                let key = Key::parse(&camelot).expect(&camelot);
                assert_eq!(key.camelot(), camelot);
                // …and the traditional name parses back to the same key.
                assert_eq!(Key::parse(&key.name()), Some(key), "{camelot}");
            }
        }
    }

    #[test]
    fn traditional_spellings_are_understood() {
        let f_minor = Key::parse("Fm").unwrap();
        assert_eq!(Key::parse("F minor"), Some(f_minor));
        assert_eq!(Key::parse("Fmin"), Some(f_minor));
        assert_eq!(f_minor.camelot(), "4A");

        // The parallel major is a different key, and a long way round the
        // wheel — which is why getting the mode right matters.
        let f_major = Key::parse("F").unwrap();
        assert_eq!(Key::parse("F major"), Some(f_major));
        assert_eq!(f_major.camelot(), "7B");
        assert_ne!(f_major, f_minor);
    }

    #[test]
    fn accidentals_are_understood_in_both_spellings() {
        assert_eq!(Key::parse("Abm"), Key::parse("G#m"));
        assert_eq!(Key::parse("Abm").unwrap().camelot(), "1A");
        assert_eq!(Key::parse("Bb").unwrap().camelot(), "6B");
        assert_eq!(Key::parse("C#").unwrap().camelot(), "3B");
        // Written back out with sharps, chosen once so a key always looks the
        // same wherever it appears.
        assert_eq!(Key::parse("Bb").unwrap().name(), "A#");
    }

    #[test]
    fn nonsense_is_not_a_key() {
        for input in [
            "", "  ", "Hm", "42", "F lydian", "unknown", "13A", "0A", "8C",
        ] {
            assert_eq!(Key::parse(input), None, "{input:?}");
        }
    }

    /// Relative major and minor share a key signature and mix freely, so they
    /// share a wheel position — the number in Camelot.
    #[test]
    fn relative_keys_share_a_position() {
        assert_eq!(
            Key::parse("Am").unwrap().wheel_position(),
            Key::parse("C").unwrap().wheel_position()
        );
        assert_eq!(
            Key::parse("Em").unwrap().wheel_position(),
            Key::parse("G").unwrap().wheel_position()
        );
    }

    /// A fifth up is one step round the wheel. That is what makes adjacent
    /// numbers mix.
    #[test]
    fn a_fifth_up_is_one_step_round_the_wheel() {
        for root in 0..12u8 {
            let here = Key {
                root,
                is_major: true,
            }
            .wheel_position() as i32;
            let fifth = Key {
                root: (root + 7) % 12,
                is_major: true,
            }
            .wheel_position() as i32;
            assert_eq!((fifth - here).rem_euclid(12), 1, "a fifth above {root}");
        }
    }
}
