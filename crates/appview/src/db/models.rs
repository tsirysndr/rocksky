//! Row structs for the appview tables, and the column lists that fill them.
//!
//! One struct decodes from either backend. That works because the column lists
//! are generated per dialect and Postgres casts where its native type would not
//! decode into the Rust one:
//!
//! | Postgres type | Problem                            | Cast emitted            |
//! |---------------|------------------------------------|-------------------------|
//! | `int4`        | will not decode into `i64`         | `::bigint`              |
//! | `float4`      | will not decode into `f64`         | `::double precision`    |
//! | `timestamp`   | no timezone, will not decode into `DateTime<Utc>` | `::timestamptz` |
//! | `text[]`      | not a `String`                     | `to_json(…)::text`      |
//! | `jsonb`       | not a `String`                     | `::text`                |
//!
//! The `::timestamptz` cast relies on the session timezone being UTC, which
//! [`super::connect_postgres`] sets on every connection. Without that, a
//! `timestamp without time zone` column — which is what most of the Postgres
//! schema uses — would be reinterpreted in the server's local zone.
//!
//! SQLite needs none of this: values are already text/integer/real in the
//! shapes the structs want.

use super::Dialect;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

/// How a column must be coerced for the Rust field to decode.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ColKind {
    /// `text`, `boolean` — decodes as-is on both backends.
    AsIs,
    /// Postgres `int4`, needed as `i64`.
    Int,
    /// Postgres `float4`, needed as `f64`.
    Real,
    /// Any datetime, needed as `DateTime<Utc>`.
    Timestamp,
    /// Postgres `text[]`, read as a JSON array string.
    TextArray,
    /// Postgres `jsonb`, read as a JSON string.
    Json,
}

/// A column and the struct field it fills.
#[derive(Debug, Clone, Copy)]
pub struct Col {
    pub name: &'static str,
    pub alias: &'static str,
    pub kind: ColKind,
}

/// Declares a column list. `name => alias` renames; a bare `name` aliases to
/// itself. The kind defaults to [`ColKind::AsIs`].
macro_rules! cols {
    ($($name:literal $(=> $alias:literal)? $(, $kind:ident)? );* $(;)?) => {
        &[$(Col {
            name: $name,
            // The shadowing `let`s are how an optional macro fragment picks a
            // default; the first binding is genuinely unused when the override
            // is present, which is the intent rather than an oversight.
            alias: {
                #[allow(unused_variables)]
                let alias = $name;
                $(let alias = $alias;)?
                alias
            },
            kind: {
                #[allow(unused_variables)]
                let kind = ColKind::AsIs;
                $(let kind = ColKind::$kind;)?
                kind
            },
        }),*]
    };
}

/// Renders a `SELECT` list for `dialect`, applying the casts Postgres needs.
///
/// `prefix` is an optional table alias (`"s"` → `s.user_id`), which the joined
/// queries need to disambiguate columns of the same name.
pub fn select_list(columns: &[Col], dialect: Dialect, prefix: Option<&str>) -> String {
    let qualify = |name: &str| match prefix {
        Some(prefix) => format!("{prefix}.{name}"),
        None => name.to_string(),
    };

    columns
        .iter()
        .map(|col| {
            let reference = qualify(col.name);
            let expression = match (dialect, col.kind) {
                (Dialect::Sqlite, _) | (_, ColKind::AsIs) => reference,
                (Dialect::Postgres, ColKind::Int) => format!("{reference}::bigint"),
                (Dialect::Postgres, ColKind::Real) => format!("{reference}::double precision"),
                (Dialect::Postgres, ColKind::Timestamp) => format!("{reference}::timestamptz"),
                (Dialect::Postgres, ColKind::TextArray) => format!("to_json({reference})::text"),
                (Dialect::Postgres, ColKind::Json) => format!("{reference}::text"),
            };
            format!("{expression} AS {}", col.alias)
        })
        .collect::<Vec<_>>()
        .join(", ")
}

/// Wraps an integer expression so it decodes as `i64`.
///
/// Needed for columns and aggregates that are `int4` on Postgres — including
/// the `count(*)::int` casts inside the materialized views — since sqlx will
/// not decode an `int4` into an `i64`.
pub fn cast_int(dialect: Dialect, expr: &str) -> String {
    match dialect {
        Dialect::Sqlite => expr.to_string(),
        Dialect::Postgres => format!("({expr})::bigint"),
    }
}

/// The SQL expression for the current year, as an integer.
pub fn current_year(dialect: Dialect) -> &'static str {
    match dialect {
        // strftime returns text, so it needs the cast to compare numerically.
        Dialect::Sqlite => "CAST(strftime('%Y', 'now') AS INTEGER)",
        Dialect::Postgres => "EXTRACT(YEAR FROM CURRENT_DATE)::int",
    }
}

/// Renders a `SELECT` list whose aliases carry a prefix.
///
/// Needed when two models appear in one row: each one's own list aliases
/// `xata_id AS id`, so selecting both gives two columns called `id` and
/// `FromRow` reads whichever came first. Prefixing one of them keeps both
/// readable.
pub fn select_list_aliased(
    columns: &[Col],
    dialect: Dialect,
    prefix: Option<&str>,
    alias_prefix: &str,
) -> String {
    let plain = select_list(columns, dialect, prefix);
    // `select_list` emits "<expr> AS <alias>" per column; only the alias moves.
    plain
        .split(", ")
        .map(|part| match part.rsplit_once(" AS ") {
            Some((expr, alias)) => format!("{expr} AS {alias_prefix}{alias}"),
            None => part.to_string(),
        })
        .collect::<Vec<_>>()
        .join(", ")
}

/// Parses a `text[]`-turned-JSON column. A NULL, an empty string or malformed
/// JSON all yield an empty vector: these columns are display metadata (genres,
/// collaborators) and a parse failure must not fail the whole request.
pub fn json_array(raw: Option<&str>) -> Vec<String> {
    let Some(raw) = raw.map(str::trim).filter(|s| !s.is_empty()) else {
        return Vec::new();
    };
    serde_json::from_str(raw).unwrap_or_default()
}

// ---------------------------------------------------------------- users

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub did: String,
    pub display_name: Option<String>,
    pub handle: String,
    pub avatar: String,
    pub is_bot: bool,
    pub bot_flagged_at: Option<DateTime<Utc>>,
    pub bot_reason: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    /// Xata's row version. Meaningless to this crate, but the TypeScript API
    /// emits it as `xataVersion` in several views, so it is carried through.
    pub xata_version: Option<i64>,
}

pub const USER_COLS: &[Col] = cols! {
    "xata_id" => "id";
    "did";
    "display_name";
    "handle";
    "avatar";
    "is_bot";
    "bot_flagged_at", Timestamp;
    "bot_reason";
    "xata_createdat" => "created_at", Timestamp;
    "xata_updatedat" => "updated_at", Timestamp;
    "xata_version", Int;
};

// ---------------------------------------------------------------- artists

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Artist {
    pub id: String,
    pub name: String,
    pub biography: Option<String>,
    pub born: Option<DateTime<Utc>>,
    pub born_in: Option<String>,
    pub died: Option<DateTime<Utc>>,
    pub picture: Option<String>,
    pub sha256: String,
    pub uri: Option<String>,
    pub apple_music_link: Option<String>,
    pub spotify_link: Option<String>,
    pub tidal_link: Option<String>,
    pub youtube_link: Option<String>,
    /// JSON array text; read it with [`Artist::genres`].
    pub genres: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    /// Xata's row version. Meaningless to this crate, but the TypeScript API
    /// emits it as `xataVersion` in several views, so it is carried through.
    pub xata_version: Option<i64>,
}

impl Artist {
    pub fn genres(&self) -> Vec<String> {
        json_array(self.genres.as_deref())
    }
}

pub const ARTIST_COLS: &[Col] = cols! {
    "xata_id" => "id";
    "name";
    "biography";
    "born", Timestamp;
    "born_in";
    "died", Timestamp;
    "picture";
    "sha256";
    "uri";
    "apple_music_link";
    "spotify_link";
    "tidal_link";
    "youtube_link";
    "genres", TextArray;
    "xata_createdat" => "created_at", Timestamp;
    "xata_updatedat" => "updated_at", Timestamp;
    "xata_version", Int;
};

// ---------------------------------------------------------------- albums

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Album {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub release_date: Option<String>,
    pub year: Option<i64>,
    pub album_art: Option<String>,
    pub uri: Option<String>,
    pub artist_uri: Option<String>,
    pub apple_music_link: Option<String>,
    pub spotify_link: Option<String>,
    pub tidal_link: Option<String>,
    pub youtube_link: Option<String>,
    pub sha256: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    /// Xata's row version. Meaningless to this crate, but the TypeScript API
    /// emits it as `xataVersion` in several views, so it is carried through.
    pub xata_version: Option<i64>,
}

pub const ALBUM_COLS: &[Col] = cols! {
    "xata_id" => "id";
    "title";
    "artist";
    "release_date";
    "year", Int;
    "album_art";
    "uri";
    "artist_uri";
    "apple_music_link";
    "spotify_link";
    "tidal_link";
    "youtube_link";
    "sha256";
    "xata_createdat" => "created_at", Timestamp;
    "xata_updatedat" => "updated_at", Timestamp;
    "xata_version", Int;
};

// ---------------------------------------------------------------- tracks

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Track {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album_artist: String,
    pub album_art: Option<String>,
    pub album: String,
    pub track_number: Option<i64>,
    pub duration: i64,
    pub mb_id: Option<String>,
    pub isrc: Option<String>,
    pub youtube_link: Option<String>,
    pub spotify_link: Option<String>,
    pub apple_music_link: Option<String>,
    pub tidal_link: Option<String>,
    pub sha256: String,
    pub disc_number: Option<i64>,
    pub lyrics: Option<String>,
    pub composer: Option<String>,
    pub genre: Option<String>,
    pub label: Option<String>,
    pub copyright_message: Option<String>,
    pub key: Option<String>,
    pub bpm: Option<f64>,
    pub uri: Option<String>,
    pub album_uri: Option<String>,
    pub artist_uri: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    /// Xata's row version. Meaningless to this crate, but the TypeScript API
    /// emits it as `xataVersion` in several views, so it is carried through.
    pub xata_version: Option<i64>,
}

pub const TRACK_COLS: &[Col] = cols! {
    "xata_id" => "id";
    "title";
    "artist";
    "album_artist";
    "album_art";
    "album";
    "track_number", Int;
    "duration", Int;
    "mb_id";
    "isrc";
    "youtube_link";
    "spotify_link";
    "apple_music_link";
    "tidal_link";
    "sha256";
    "disc_number", Int;
    "lyrics";
    "composer";
    "genre";
    "label";
    "copyright_message";
    "key";
    "bpm", Real;
    "uri";
    "album_uri";
    "artist_uri";
    "xata_createdat" => "created_at", Timestamp;
    "xata_updatedat" => "updated_at", Timestamp;
    "xata_version", Int;
};

// -------------------------------------------------------- storage providers

/// `user_storage_providers`. The credential columns are included but stay
/// encrypted; see [`crate::storage::providers::StorageProvider`].
pub const STORAGE_PROVIDER_COLS: &[Col] = cols! {
    "xata_id" => "id";
    "label";
    "endpoint";
    "region";
    "bucket";
    "access_key";
    "secret_key";
    "public_url";
    "verified_at", Timestamp;
    "xata_createdat" => "created_at", Timestamp;
};

// ------------------------------------------------------------- credentials

/// `api_keys`, minus `user_id` — which is never disclosed to the client.
pub const API_KEY_COLS: &[Col] = cols! {
    "xata_id" => "id";
    "name";
    "api_key";
    "shared_secret";
    "description";
    "enabled";
    "xata_createdat" => "created_at", Timestamp;
    "xata_updatedat" => "updated_at", Timestamp;
};

/// `access_tokens`, minus `token_encrypted` and `jti` — the secret and the
/// revocation handle stay server-side.
pub const ACCESS_TOKEN_COLS: &[Col] = cols! {
    "xata_id" => "id";
    "name";
    "last_four";
    "last_used_at", Timestamp;
    "xata_createdat" => "created_at", Timestamp;
    "xata_updatedat" => "updated_at", Timestamp;
};

// ------------------------------------------------------------ user_uploads

pub const UPLOAD_COLS: &[Col] = cols! {
    "xata_id" => "id";
    "user_id";
    "track_id";
    "r2_key";
    "mime_type";
    "file_size", Int;
    "original_filename";
    "sample_rate", Int;
    "storage_provider_id";
    "uploaded_at", Timestamp;
    "xata_createdat" => "created_at", Timestamp;
    "xata_updatedat" => "updated_at", Timestamp;
    "xata_version", Int;
};

// ------------------------------------------------------------ loved_tracks

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct LovedTrack {
    pub id: String,
    pub user_id: String,
    pub track_id: String,
    pub uri: Option<String>,
    pub created_at: DateTime<Utc>,
}

pub const LOVED_TRACK_COLS: &[Col] = cols! {
    "xata_id" => "id";
    "user_id";
    "track_id";
    "uri";
    "xata_createdat" => "created_at", Timestamp;
};

// ---------------------------------------------------------------- scrobbles

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Scrobble {
    pub id: String,
    pub user_id: Option<String>,
    pub track_id: Option<String>,
    pub album_id: Option<String>,
    pub artist_id: Option<String>,
    pub uri: Option<String>,
    pub timestamp: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    /// Xata's row version. Meaningless to this crate, but the TypeScript API
    /// emits it as `xataVersion` in several views, so it is carried through.
    pub xata_version: Option<i64>,
}

pub const SCROBBLE_COLS: &[Col] = cols! {
    "xata_id" => "id";
    "user_id";
    "track_id";
    "album_id";
    "artist_id";
    "uri";
    "timestamp", Timestamp;
    "xata_createdat" => "created_at", Timestamp;
    "xata_updatedat" => "updated_at", Timestamp;
    "xata_version", Int;
};

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{self, Backend};

    #[test]
    fn json_arrays_tolerate_null_empty_and_garbage() {
        assert!(json_array(None).is_empty());
        assert!(json_array(Some("")).is_empty());
        assert!(json_array(Some("   ")).is_empty());
        assert!(json_array(Some("not json")).is_empty());
        assert_eq!(json_array(Some("[]")), Vec::<String>::new());
        assert_eq!(
            json_array(Some(r#"["rock","indie pop"]"#)),
            vec!["rock", "indie pop"]
        );
    }

    #[test]
    fn sqlite_lists_are_plain_aliases() {
        let list = select_list(USER_COLS, Dialect::Sqlite, None);
        assert!(list.starts_with("xata_id AS id, did AS did, "), "{list}");
        assert!(list.contains("xata_createdat AS created_at"), "{list}");
        assert!(!list.contains("::"), "sqlite needs no casts: {list}");
    }

    #[test]
    fn postgres_lists_cast_every_type_that_would_not_decode() {
        let tracks = select_list(TRACK_COLS, Dialect::Postgres, None);
        // int4 -> i64
        assert!(tracks.contains("duration::bigint AS duration"), "{tracks}");
        assert!(
            tracks.contains("track_number::bigint AS track_number"),
            "{tracks}"
        );
        // float4 -> f64
        assert!(tracks.contains("bpm::double precision AS bpm"), "{tracks}");
        // timestamp (no tz) -> DateTime<Utc>
        assert!(
            tracks.contains("xata_createdat::timestamptz AS created_at"),
            "{tracks}"
        );
        // text is left alone
        assert!(tracks.contains("title AS title"), "{tracks}");

        // text[] -> JSON string
        let artists = select_list(ARTIST_COLS, Dialect::Postgres, None);
        assert!(
            artists.contains("to_json(genres)::text AS genres"),
            "{artists}"
        );
    }

    #[test]
    fn an_alias_prefix_renames_only_the_aliases() {
        // Two models in one row would otherwise both claim `id`.
        let list = select_list_aliased(TRACK_COLS, Dialect::Sqlite, Some("t"), "track_");
        assert!(list.contains("t.xata_id AS track_id"), "{list}");
        assert!(list.contains("t.title AS track_title"), "{list}");

        // The cast stays on the expression side, not the alias.
        let pg = select_list_aliased(TRACK_COLS, Dialect::Postgres, Some("t"), "track_");
        assert!(pg.contains("t.duration::bigint AS track_duration"), "{pg}");
    }

    #[test]
    fn a_prefix_qualifies_every_column() {
        let list = select_list(SCROBBLE_COLS, Dialect::Sqlite, Some("s"));
        assert!(list.contains("s.xata_id AS id"), "{list}");
        assert!(list.contains("s.timestamp AS timestamp"), "{list}");

        let pg = select_list(SCROBBLE_COLS, Dialect::Postgres, Some("s"));
        assert!(pg.contains("s.timestamp::timestamptz AS timestamp"), "{pg}");
    }

    /// Every alias has to match a struct field name, or `query_as` fails at
    /// runtime with "no column found". Decoding a real row is the only way to
    /// check that, so each model gets a row inserted and read back.
    async fn fixture() -> Backend {
        let backend = db::connect_in_memory().await.unwrap();
        let user_id = db::new_id();
        let artist_id = db::new_id();
        let album_id = db::new_id();
        let track_id = db::new_id();

        let statements: Vec<(&str, Vec<db::query::Arg>)> = vec![
            (
                "INSERT INTO users (xata_id, did, handle, avatar) VALUES (?, ?, ?, ?)",
                vec![
                    user_id.clone().into(),
                    "did:plc:abc".into(),
                    "someone.rocksky.app".into(),
                    "https://example.invalid/a.png".into(),
                ],
            ),
            (
                "INSERT INTO artists (xata_id, name, sha256, genres) VALUES (?, ?, ?, ?)",
                vec![
                    artist_id.clone().into(),
                    "Boards of Canada".into(),
                    "sha-artist".into(),
                    r#"["electronic","ambient"]"#.into(),
                ],
            ),
            (
                "INSERT INTO albums (xata_id, title, artist, sha256, year) VALUES (?, ?, ?, ?, ?)",
                vec![
                    album_id.clone().into(),
                    "Music Has the Right to Children".into(),
                    "Boards of Canada".into(),
                    "sha-album".into(),
                    1998i64.into(),
                ],
            ),
            (
                "INSERT INTO tracks (xata_id, title, artist, album_artist, album, duration, sha256, bpm)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                vec![
                    track_id.clone().into(),
                    "Roygbiv".into(),
                    "Boards of Canada".into(),
                    "Boards of Canada".into(),
                    "Music Has the Right to Children".into(),
                    151_000i64.into(),
                    "sha-track".into(),
                    85.5f64.into(),
                ],
            ),
            (
                "INSERT INTO scrobbles (xata_id, user_id, track_id, album_id, artist_id, uri)
                 VALUES (?, ?, ?, ?, ?, ?)",
                vec![
                    db::new_id().into(),
                    user_id.into(),
                    track_id.into(),
                    album_id.into(),
                    artist_id.into(),
                    "at://did:plc:abc/app.rocksky.scrobble/1".into(),
                ],
            ),
        ];

        for (text, args) in statements {
            let mut sql = backend.sql("");
            let mut remaining = args.into_iter();
            for part in text.split('?') {
                sql.push(part);
                if let Some(arg) = remaining.next() {
                    sql.bind(arg);
                }
            }
            backend.execute(&sql).await.expect(text);
        }

        backend
    }

    #[tokio::test]
    async fn user_columns_decode_into_the_struct() {
        let backend = fixture().await;
        let list = select_list(USER_COLS, backend.dialect(), None);
        let user: User = backend
            .fetch_optional(&backend.sql(format!("SELECT {list} FROM users")))
            .await
            .expect("USER_COLS aliases must match User's fields")
            .expect("one row");

        assert_eq!(user.handle, "someone.rocksky.app");
        assert!(!user.is_bot, "INTEGER 0 should decode as false");
        assert_eq!(user.display_name, None);
    }

    #[tokio::test]
    async fn artist_columns_decode_and_genres_parse() {
        let backend = fixture().await;
        let list = select_list(ARTIST_COLS, backend.dialect(), None);
        let artist: Artist = backend
            .fetch_optional(&backend.sql(format!("SELECT {list} FROM artists")))
            .await
            .expect("ARTIST_COLS aliases must match Artist's fields")
            .expect("one row");

        assert_eq!(artist.genres(), vec!["electronic", "ambient"]);
    }

    #[tokio::test]
    async fn album_columns_decode_into_the_struct() {
        let backend = fixture().await;
        let list = select_list(ALBUM_COLS, backend.dialect(), None);
        let album: Album = backend
            .fetch_optional(&backend.sql(format!("SELECT {list} FROM albums")))
            .await
            .expect("ALBUM_COLS aliases must match Album's fields")
            .expect("one row");

        assert_eq!(album.year, Some(1998));
    }

    #[tokio::test]
    async fn track_columns_decode_into_the_struct() {
        let backend = fixture().await;
        let list = select_list(TRACK_COLS, backend.dialect(), None);
        let track: Track = backend
            .fetch_optional(&backend.sql(format!("SELECT {list} FROM tracks")))
            .await
            .expect("TRACK_COLS aliases must match Track's fields")
            .expect("one row");

        assert_eq!(track.title, "Roygbiv");
        assert_eq!(track.duration, 151_000);
        assert_eq!(track.bpm, Some(85.5));
    }

    #[tokio::test]
    async fn scrobble_columns_decode_prefixed_and_unprefixed() {
        let backend = fixture().await;

        let list = select_list(SCROBBLE_COLS, backend.dialect(), None);
        let scrobble: Scrobble = backend
            .fetch_optional(&backend.sql(format!("SELECT {list} FROM scrobbles")))
            .await
            .expect("SCROBBLE_COLS aliases must match Scrobble's fields")
            .expect("one row");
        assert_eq!(
            scrobble.uri.as_deref(),
            Some("at://did:plc:abc/app.rocksky.scrobble/1")
        );

        // The joined queries rely on the prefixed form resolving too.
        let prefixed = select_list(SCROBBLE_COLS, backend.dialect(), Some("s"));
        let joined: Scrobble = backend
            .fetch_optional(&backend.sql(format!(
                "SELECT {prefixed} FROM scrobbles s \
                 LEFT JOIN tracks t ON t.xata_id = s.track_id"
            )))
            .await
            .expect("prefixed SCROBBLE_COLS must decode")
            .expect("one row");
        assert_eq!(joined.id, scrobble.id);
    }
}
