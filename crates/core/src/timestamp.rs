//! Timestamp serialization that matches JavaScript's `Date#toISOString()`.
//!
//! This is not cosmetic. The TypeScript API hands `Date` objects to
//! `JSON.stringify`, which calls `toISOString()` and always emits exactly three
//! fractional digits: `2026-09-15T12:34:56.789Z`. chrono's default `Serialize`
//! for `DateTime<Utc>` emits full sub-second precision instead
//! (`...:56.789123456Z`) and drops the fraction entirely when it is zero
//! (`...:56Z`). Any client parsing these by pattern, comparing them as strings,
//! or round-tripping them as cache keys would see a different value for the
//! same instant.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Deserializer, Serializer};

/// `YYYY-MM-DDTHH:MM:SS.sssZ` — exactly what `toISOString()` produces.
const FORMAT: &str = "%Y-%m-%dT%H:%M:%S%.3fZ";

pub fn to_iso8601(value: &DateTime<Utc>) -> String {
    value.format(FORMAT).to_string()
}

/// For a non-optional field: `#[serde(with = "timestamp::required")]`.
pub mod required {
    use super::*;

    pub fn serialize<S: Serializer>(
        value: &DateTime<Utc>,
        serializer: S,
    ) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&to_iso8601(value))
    }

    /// Present so the views round-trip: they are cached as JSON and read back.
    pub fn deserialize<'de, D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<DateTime<Utc>, D::Error> {
        let raw = String::deserialize(deserializer)?;
        DateTime::parse_from_rfc3339(&raw)
            .map(|value| value.with_timezone(&Utc))
            .map_err(serde::de::Error::custom)
    }
}

/// For an optional field: `#[serde(with = "timestamp::optional")]`.
pub mod optional {
    use super::*;

    pub fn serialize<S: Serializer>(
        value: &Option<DateTime<Utc>>,
        serializer: S,
    ) -> Result<S::Ok, S::Error> {
        match value {
            Some(value) => serializer.serialize_str(&to_iso8601(value)),
            None => serializer.serialize_none(),
        }
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Option<DateTime<Utc>>, D::Error> {
        let raw = Option::<String>::deserialize(deserializer)?;
        match raw {
            None => Ok(None),
            Some(raw) => DateTime::parse_from_rfc3339(&raw)
                .map(|value| Some(value.with_timezone(&Utc)))
                .map_err(serde::de::Error::custom),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Serialize;

    fn at(raw: &str) -> DateTime<Utc> {
        DateTime::parse_from_rfc3339(raw)
            .unwrap()
            .with_timezone(&Utc)
    }

    #[derive(Serialize, Deserialize, PartialEq, Debug)]
    struct Holder {
        #[serde(with = "required")]
        when: DateTime<Utc>,
        #[serde(with = "optional")]
        maybe: Option<DateTime<Utc>>,
    }

    #[test]
    fn milliseconds_are_always_exactly_three_digits() {
        // A whole second: chrono's default would emit "...:56Z" with no
        // fraction, but toISOString() always writes ".000".
        assert_eq!(
            to_iso8601(&at("2026-09-15T12:34:56Z")),
            "2026-09-15T12:34:56.000Z"
        );
        assert_eq!(
            to_iso8601(&at("2026-09-15T12:34:56.789Z")),
            "2026-09-15T12:34:56.789Z"
        );
    }

    #[test]
    fn sub_millisecond_precision_is_truncated_not_extended() {
        // chrono's default would emit nanoseconds here.
        assert_eq!(
            to_iso8601(&at("2026-09-15T12:34:56.789123456Z")),
            "2026-09-15T12:34:56.789Z"
        );
    }

    #[test]
    fn offsets_are_normalized_to_utc() {
        assert_eq!(
            to_iso8601(&at("2026-09-15T14:34:56+02:00")),
            "2026-09-15T12:34:56.000Z"
        );
    }

    #[test]
    fn the_serde_adapters_emit_the_same_format() {
        let holder = Holder {
            when: at("2026-09-15T12:34:56Z"),
            maybe: Some(at("2020-01-02T03:04:05.5Z")),
        };
        let json = serde_json::to_string(&holder).unwrap();
        assert_eq!(
            json,
            r#"{"when":"2026-09-15T12:34:56.000Z","maybe":"2020-01-02T03:04:05.500Z"}"#
        );
    }

    #[test]
    fn an_absent_optional_serializes_as_null() {
        let holder = Holder {
            when: at("2026-09-15T12:34:56Z"),
            maybe: None,
        };
        let json = serde_json::to_string(&holder).unwrap();
        assert!(json.contains(r#""maybe":null"#), "{json}");
    }

    /// Views are cached as JSON and read back, so they must round-trip.
    #[test]
    fn values_round_trip_through_json() {
        let holder = Holder {
            when: at("2026-09-15T12:34:56.789Z"),
            maybe: Some(at("2020-01-02T03:04:05.500Z")),
        };
        let json = serde_json::to_string(&holder).unwrap();
        let back: Holder = serde_json::from_str(&json).unwrap();
        assert_eq!(back, holder);
    }
}
