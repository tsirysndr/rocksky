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

// ------------------------------------------------- sea-query projections

/// The expression for one column, with the cast this dialect needs.
///
/// The casts are not cosmetic. On Postgres an `int4` column will not decode
/// into an `i64`, a `jsonb` will not decode into a `String`, and a `text[]` has
/// no sqlx decoder at all — each needs the cast to come back as the type the
/// model declares. On SQLite every one of them is a no-op, and applying them
/// anyway would be actively wrong: `CAST(x AS timestamptz)` there has no type
/// affinity and would mangle the ISO text these columns hold.
pub fn column_expr(col: Col, dialect: Dialect, prefix: Option<&str>) -> sea_query::SimpleExpr {
    use sea_query::{Alias, Expr, ExprTrait, Func};

    let reference = match prefix {
        Some(prefix) => Expr::col((Alias::new(prefix), Alias::new(col.name))),
        None => Expr::col(Alias::new(col.name)),
    };

    match (dialect, col.kind) {
        (Dialect::Sqlite, _) | (_, ColKind::AsIs) => reference.into(),
        (Dialect::Postgres, ColKind::Int) => reference.cast_as(Alias::new("bigint")),
        (Dialect::Postgres, ColKind::Real) => reference.cast_as(Alias::new("double precision")),
        (Dialect::Postgres, ColKind::Timestamp) => reference.cast_as(Alias::new("timestamptz")),
        (Dialect::Postgres, ColKind::TextArray) => {
            // A `text[]` has no sqlx decoder; the models read it as JSON text.
            Func::cust(Alias::new("to_json"))
                .arg(reference)
                .cast_as(Alias::new("text"))
        }
        (Dialect::Postgres, ColKind::Json) => reference.cast_as(Alias::new("text")),
    }
}

/// The year of a timestamp column, as SQL text for the dialect given.
///
/// `EXTRACT(YEAR FROM …)` against `strftime('%Y', …)`. The SQLite form yields
/// text, so it is cast — otherwise `BETWEEN 1990 AND 2000` compares a string
/// against numbers and matches nothing.
pub fn year_of(dialect: Dialect, column: &str) -> String {
    match dialect {
        Dialect::Postgres => format!("EXTRACT(YEAR FROM {column})"),
        Dialect::Sqlite => format!("CAST(strftime('%Y', {column}) AS INTEGER)"),
    }
}

/// `NOW()`, as SQL text for the dialect given.
///
/// SQLite keeps these columns as ISO-8601 text, so "now" has to be produced in
/// that same shape — `strftime`, not `CURRENT_TIMESTAMP`, whose format
/// (`YYYY-MM-DD HH:MM:SS`, space-separated, no milliseconds, no `Z`) does not
/// compare correctly against the stored values.
pub fn now_sql(dialect: Dialect) -> &'static str {
    match dialect {
        Dialect::Postgres => "NOW()",
        Dialect::Sqlite => "(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
    }
}

/// `NOW() - INTERVAL '<n> minutes'`, for the dialect given.
///
/// Used to bound a "recently" window. SQLite has no interval type; the
/// equivalent is a modifier on `strftime`, which yields the same ISO text the
/// column holds.
pub fn minutes_ago_sql(dialect: Dialect, minutes: u32) -> String {
    match dialect {
        Dialect::Postgres => format!("NOW() - INTERVAL '{minutes} minutes'"),
        Dialect::Sqlite => {
            format!("(strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-{minutes} minutes'))")
        }
    }
}

/// Whole minutes between `column` and now.
///
/// `EXTRACT(EPOCH FROM (NOW() - ts))` has no SQLite spelling; there, the two
/// timestamps go through `julianday` and the difference is in days, so it is
/// scaled. Both round towards zero, which is what "3 minutes ago" wants.
pub fn minutes_since_sql(dialect: Dialect, column: &str) -> String {
    match dialect {
        Dialect::Postgres => {
            format!("EXTRACT(EPOCH FROM (NOW() - {column}))::bigint / 60")
        }
        Dialect::Sqlite => {
            format!("CAST((julianday('now') - julianday({column})) * 1440 AS INTEGER)")
        }
    }
}

/// Wraps an integer expression so it decodes as `i64`, for the dialect given.
///
/// The free-function form of [`crate::Backend::cast_int`], for the statement
/// builders that are handed a dialect rather than a connection — a builder
/// that takes a `Backend` cannot be rendered in a test without one.
pub fn cast_int_expr(
    dialect: Dialect,
    expr: impl Into<sea_query::SimpleExpr>,
) -> sea_query::SimpleExpr {
    match dialect {
        Dialect::Sqlite => expr.into(),
        Dialect::Postgres => expr.into().cast_as(sea_query::Alias::new("bigint")),
    }
}

/// Wraps a timestamp expression so it decodes as `DateTime<Utc>`.
///
/// The free-function form of [`crate::Backend::cast_timestamp`]. SQLite must
/// *not* get the cast: `CAST(… AS timestamptz)` is not an error there, it is a
/// no-op with no type affinity, and the ISO text is truncated to its leading
/// year — a silent wrong answer rather than a failure.
pub fn cast_timestamp_expr(
    dialect: Dialect,
    expr: impl Into<sea_query::SimpleExpr>,
) -> sea_query::SimpleExpr {
    match dialect {
        Dialect::Sqlite => expr.into(),
        Dialect::Postgres => expr.into().cast_as(sea_query::Alias::new("timestamptz")),
    }
}

/// Whether a "genres"-style array column contains `value`.
///
/// The two backends store these columns differently and there is no common
/// spelling: Postgres has a real `text[]` and the `@>` operator, while SQLite
/// holds a JSON array in a TEXT column and has to walk it with `json_each`.
///
/// A free function taking the dialect, so both branches can be asserted
/// without a Postgres to connect to. Reached through
/// [`crate::Backend::array_contains`], which supplies it.
pub fn array_contains_expr(dialect: Dialect, column: &str, value: &str) -> sea_query::SimpleExpr {
    use sea_query::Expr;

    // The placeholder marker differs: sea-query substitutes `$N` only for
    // Postgres and `?` for SQLite, so using `$1` for both leaves a literal
    // `$1` in the SQLite statement — a condition that binds nothing and
    // matches nothing, with no error to say so.
    match dialect {
        // `$1 = ANY(col)` rather than `col @> ARRAY[$1]::text[]`, which says
        // the same thing and does not work: sea-query does not substitute a
        // `$N` marker that sits inside `ARRAY[…]` — the bracket stops its
        // tokenizer — so the value was dropped and the literal `$1` collided
        // with the statement's own first parameter. The query then ran and
        // matched against whatever that parameter happened to be.
        Dialect::Postgres => {
            Expr::cust_with_values(format!("$1 = ANY({column})"), [value.to_string()])
        }
        Dialect::Sqlite => Expr::cust_with_values(
            format!("EXISTS (SELECT 1 FROM json_each({column}) WHERE json_each.value = ?)"),
            [value.to_string()],
        ),
    }
}

/// An ISO-8601 timestamp as a value comparable against a timestamp column.
///
/// Bound as text, because that is how SQLite stores these columns, and cast on
/// Postgres because a bound parameter is typed `text` there and
/// `timestamptz >= text` has no operator — the comparison is a runtime error,
/// not a wrong answer, so it takes down the whole handler.
///
/// SQLite must *not* get the cast. `timestamptz` is not a type it knows, so the
/// CAST falls through to NUMERIC affinity and `'2026-01-01T…'` becomes `2026` —
/// which does compare, against every row, wrongly.
///
/// A free function taking the dialect rather than only a `Backend` method, so
/// both branches can be asserted without a Postgres to connect to.
pub fn timestamp_expr(dialect: Dialect, text: impl Into<String>) -> sea_query::SimpleExpr {
    let value = sea_query::Expr::val(text.into());
    match dialect {
        Dialect::Sqlite => value.into(),
        Dialect::Postgres => value.cast_as(sea_query::Alias::new("timestamptz")),
    }
}

/// Adds every column of a model to a `SELECT`, aliased to its field name.
///
/// The sea-query counterpart of [`select_list`]. Reached through
/// [`crate::Backend::select_model`], which supplies the dialect — a handler
/// never names one.
pub fn select_columns(
    query: &mut sea_query::SelectStatement,
    columns: &[Col],
    dialect: Dialect,
    prefix: Option<&str>,
) {
    for col in columns {
        query.expr_as(
            column_expr(*col, dialect, prefix),
            sea_query::Alias::new(col.alias),
        );
    }
}

/// The same, with a prefix on every *alias* rather than on the column.
///
/// For a row holding two models, where both alias `xata_id AS id` and sqlx
/// would otherwise read whichever came first.
pub fn select_columns_aliased(
    query: &mut sea_query::SelectStatement,
    columns: &[Col],
    dialect: Dialect,
    prefix: Option<&str>,
    alias_prefix: &str,
) {
    for col in columns {
        query.expr_as(
            column_expr(*col, dialect, prefix),
            sea_query::Alias::new(format!("{alias_prefix}{}", col.alias)),
        );
    }
}

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

// -------------------------------------------------------------- playlists

/// A playlist row, without its tracks.
///
/// The playlist handlers use their own wider row type because they select a
/// join; this is the plain table, for the callers that only need the playlist
/// itself — the search index, mainly.
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Playlist {
    pub id: String,
    pub name: String,
    pub picture: Option<String>,
    pub description: Option<String>,
    pub uri: Option<String>,
    pub created_by: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

pub const PLAYLIST_COLS: &[Col] = cols! {
    "xata_id" => "id";
    "name";
    "picture";
    "description";
    "uri";
    "created_by";
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

/// The `user_uploads` half of a search document.
///
/// Narrower than [`UPLOAD_COLS`] on purpose: a search document has no use for
/// the Xata bookkeeping or the storage provider, and this list is joined
/// against [`DOC_TRACK_COLS`], where two `xata_id AS id` aliases would collide.
pub const DOC_UPLOAD_COLS: &[Col] = cols! {
    "xata_id" => "id";
    "user_id";
    "track_id";
    "r2_key";
    "mime_type";
    "file_size", Int;
    "original_filename";
    "uploaded_at", Timestamp;
};

/// The `tracks` half of a search document.
pub const DOC_TRACK_COLS: &[Col] = cols! {
    "title";
    "artist";
    "album";
    "album_artist";
    "genre";
    "composer";
    "album_art";
    "duration", Int;
    "mb_id";
    "track_number", Int;
    "disc_number", Int;
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
    /// The time helpers, executed — a wrong `strftime` format compares against
    /// the stored ISO text incorrectly and silently, which no rendering
    /// assertion catches.
    #[tokio::test]
    async fn the_time_helpers_agree_with_the_stored_format() {
        use sea_query::{Alias, Expr, Query};

        let db = crate::connect_in_memory().await.unwrap();

        // `now_sql` has to produce the same shape `format_timestamp` writes,
        // or every "since" comparison is wrong.
        let now: Option<String> = db
            .fetch_scalar(&db.sql(format!("SELECT {}", now_sql(crate::Dialect::Sqlite))))
            .await
            .unwrap();
        let now = now.expect("a value");
        assert!(now.ends_with('Z'), "{now}");
        assert!(now.contains('T'), "{now}");
        assert_eq!(now.len(), crate::now_timestamp().len(), "{now}");

        // A row five minutes old is inside a ten-minute window and outside a
        // one-minute one. This is the comparison the now-playing lookup makes.
        let five_minutes_ago =
            crate::format_timestamp(chrono::Utc::now() - chrono::Duration::minutes(5));
        let inside: Option<i64> = db
            .fetch_scalar(&db.sql(format!(
                "SELECT 1 WHERE '{five_minutes_ago}' >= {}",
                minutes_ago_sql(crate::Dialect::Sqlite, 10)
            )))
            .await
            .unwrap();
        assert_eq!(inside, Some(1), "five minutes ago is within ten");

        let outside: Option<i64> = db
            .fetch_scalar(&db.sql(format!(
                "SELECT 1 WHERE '{five_minutes_ago}' >= {}",
                minutes_ago_sql(crate::Dialect::Sqlite, 1)
            )))
            .await
            .unwrap();
        assert_eq!(outside, None, "five minutes ago is not within one");

        // Elapsed minutes. Both dialects truncate — Postgres by integer
        // division, SQLite by the CAST — so five minutes and a few
        // milliseconds ago reads as 4, not 5. Which is why the assertion is a
        // range: the property is "about five and never negative", and pinning
        // it to one value would make the test fail on the millisecond.
        let elapsed: Option<i64> = db
            .fetch_scalar(&db.sql(format!(
                "SELECT {}",
                minutes_since_sql(crate::Dialect::Sqlite, &format!("'{five_minutes_ago}'"))
            )))
            .await
            .unwrap();
        let elapsed = elapsed.expect("a value");
        assert!((4..=5).contains(&elapsed), "elapsed minutes: {elapsed}");
    }

    /// `array_contains_expr` must *bind* its value on both dialects.
    ///
    /// The Postgres branch writes a `$1` marker inside a custom fragment, and
    /// a marker that sea-query does not substitute is worse than an error: the
    /// literal `$1` collides with the statement's own first parameter, so the
    /// query runs and matches against the wrong value.
    #[test]
    fn array_containment_binds_its_value_on_both_dialects() {
        use sea_query::{Alias, Expr, PostgresQueryBuilder, Query, SqliteQueryBuilder};
        use sea_query_binder::SqlxBinder;

        for (dialect, other_value) in [(Dialect::Postgres, "first"), (Dialect::Sqlite, "first")] {
            let mut query = Query::select();
            query
                .expr(Expr::cust("1"))
                .from(Alias::new("artists"))
                // A parameter *before* the containment, so a stray `$1` in the
                // custom fragment would collide with it.
                .and_where(Expr::col(Alias::new("name")).eq(other_value))
                .and_where(array_contains_expr(dialect, "artists.genres", "rock"));

            let (sql, values) = match dialect {
                Dialect::Postgres => query.build_sqlx(PostgresQueryBuilder),
                Dialect::Sqlite => query.build_sqlx(SqliteQueryBuilder),
            };

            let bound: Vec<String> = values
                .0
                 .0
                .iter()
                .filter_map(|v| match v {
                    sea_query::Value::String(Some(s)) => Some(s.to_string()),
                    _ => None,
                })
                .collect();
            assert!(
                bound.contains(&"rock".to_string()),
                "{dialect:?} did not bind the value: {sql} {bound:?}"
            );
            assert!(!sql.contains("'rock'"), "{dialect:?} spliced it: {sql}");
        }
    }

    use super::*;
    use crate::{self as db, Backend};

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

#[cfg(test)]
mod projection_tests {
    use super::*;
    use sea_query::{Alias, PostgresQueryBuilder, Query, SqliteQueryBuilder};

    /// Every column kind, so each cast is exercised.
    const EVERY_KIND: &[Col] = cols! {
        "xata_id" => "id";
        "plain";
        "count", Int;
        "ratio", Real;
        "xata_createdat" => "created_at", Timestamp;
        "genres", TextArray;
        "payload", Json;
    };

    /// The rendered `SELECT` list of a statement built by `select_columns`.
    fn rendered(dialect: Dialect, prefix: Option<&str>) -> String {
        let mut query = Query::select();
        select_columns(&mut query, EVERY_KIND, dialect, prefix);
        query.from(Alias::new("t"));

        let sql = match dialect {
            Dialect::Sqlite => query.to_string(SqliteQueryBuilder),
            Dialect::Postgres => query.to_string(PostgresQueryBuilder),
        };
        sql.trim_start_matches("SELECT ")
            .split(" FROM ")
            .next()
            .unwrap_or_default()
            .replace(['"', '\''], "")
    }

    /// The sea-query projection must select the same columns, with the same
    /// casts and the same aliases, as the string builder it replaces. Anything
    /// else is a row that decodes differently after a refactor.
    #[test]
    fn it_matches_the_string_builder() {
        for dialect in [Dialect::Sqlite, Dialect::Postgres] {
            for prefix in [None, Some("t")] {
                let expected = select_list(EVERY_KIND, dialect, prefix)
                    // sea-query writes `CAST(x AS bigint)` where the string
                    // builder writes `x::bigint`; both are the same cast, so
                    // the comparison is on columns, casts and aliases rather
                    // than on which syntax each one picked.
                    .replace("::bigint", "|bigint")
                    .replace("::double precision", "|double precision")
                    .replace("::timestamptz", "|timestamptz")
                    .replace("::text", "|text");

                let actual = rendered(dialect, prefix)
                    .replace("CAST(", "")
                    .replace(" AS bigint)", "|bigint")
                    .replace(" AS double precision)", "|double precision")
                    .replace(" AS timestamptz)", "|timestamptz")
                    .replace(" AS text)", "|text");

                assert_eq!(actual, expected, "{dialect:?} prefix={prefix:?}");
            }
        }
    }

    /// SQLite must get no casts at all: `CAST(x AS timestamptz)` there has no
    /// type affinity and would corrupt the ISO text these columns hold.
    #[test]
    fn sqlite_gets_no_casts() {
        let sql = rendered(Dialect::Sqlite, None);
        assert!(!sql.contains("CAST"), "{sql}");
        assert!(!sql.contains("to_json"), "{sql}");
    }

    /// And Postgres must get all of them, since none of those types decode
    /// into the Rust field they fill.
    #[test]
    fn postgres_gets_every_cast() {
        let sql = rendered(Dialect::Postgres, None);
        assert!(sql.contains("CAST(count AS bigint) AS count"), "{sql}");
        assert!(sql.contains("double precision"), "{sql}");
        assert!(sql.contains("timestamptz"), "{sql}");
        assert!(sql.contains("to_json(genres)"), "{sql}");
    }

    /// An alias prefix moves the alias, not the column — the whole point is to
    /// read two models from one row.
    #[test]
    fn an_alias_prefix_only_changes_the_alias() {
        let mut query = Query::select();
        select_columns_aliased(&mut query, USER_COLS, Dialect::Sqlite, Some("u"), "user_");
        query.from(Alias::new("users"));
        let sql = query.to_string(SqliteQueryBuilder).replace('"', "");

        assert!(sql.contains("u.xata_id AS user_id"), "{sql}");
        assert!(sql.contains("u.handle AS user_handle"), "{sql}");
        assert!(!sql.contains("u.user_xata_id"), "{sql}");
    }
}

#[cfg(test)]
mod timestamp_tests {
    use super::*;
    use sea_query::{Alias, Expr, PostgresQueryBuilder, Query, SqliteQueryBuilder};

    fn rendered(dialect: Dialect) -> String {
        let query = Query::select()
            .expr(Expr::val(1))
            .and_where(
                Expr::col(Alias::new("timestamp"))
                    .gte(timestamp_expr(dialect, "2026-01-01T00:00:00.000Z")),
            )
            .to_owned();
        match dialect {
            Dialect::Sqlite => query.to_string(SqliteQueryBuilder),
            Dialect::Postgres => query.to_string(PostgresQueryBuilder),
        }
    }

    /// Postgres needs the cast or the comparison is a runtime error: a bound
    /// parameter is typed `text`, and `timestamp >= text` has no operator.
    #[test]
    fn postgres_gets_the_cast() {
        let sql = rendered(Dialect::Postgres);
        assert!(sql.contains("CAST("), "{sql}");
        assert!(sql.contains("timestamptz"), "{sql}");
    }

    /// And SQLite must not get it. `timestamptz` is not a type SQLite knows, so
    /// the CAST falls through to NUMERIC affinity and the ISO string becomes
    /// its leading year — a comparison that succeeds against the wrong rows,
    /// which is far worse than one that fails.
    #[test]
    fn sqlite_gets_no_cast() {
        let sql = rendered(Dialect::Sqlite);
        assert!(!sql.contains("CAST("), "{sql}");
        assert!(!sql.contains("timestamptz"), "{sql}");
        assert!(sql.contains("2026-01-01T00:00:00.000Z"), "{sql}");
    }
}
