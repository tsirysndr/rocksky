//! DB helpers — connecting + loading rows.

use anyhow::Error;
use chrono::{DateTime, NaiveDateTime, Utc};
use rocksky_db::sea_query::{Alias, Expr, JoinType, Query};
use rocksky_db::Backend;
use sqlx::FromRow;
use std::time::Duration;

use crate::schema::{MirrorSources as Ms, Tracks, Users};
use crate::Provider;

pub async fn connect() -> Result<Backend, Error> {
    // Mirrors scrobbles from other services in, and reads the watermark it just
    // wrote on the next pass, so it stays on the primary.
    //
    // Postgres when one is configured — keeping the read-only check, because a
    // mirror that cannot write drops every scrobble it fetches — and otherwise
    // the shared SQLite file.
    let db = rocksky_pgurl::connect_handle("rocksky-mirror", |opts| {
        opts.max_connections(8)
            .min_connections(2)
            .acquire_timeout(Duration::from_secs(12))
            .max_lifetime(Some(Duration::from_secs(60 * 14)))
            .test_before_acquire(true)
    })
    .await?;
    tracing::info!(database = %db.source(), "mirror database");
    Ok(db.primary().clone())
}

/// The `mirror_sources` projection both lookups share, joined to the user's
/// DID. One definition, so the two cannot drift apart — the row struct names
/// all seven columns and a missing alias is a decode failure at runtime.
fn source_select() -> rocksky_db::sea_query::SelectStatement {
    Query::select()
        .expr_as(Expr::col((Ms::Table, Ms::UserId)), Alias::new("user_id"))
        .expr_as(Expr::col((Users::Table, Users::Did)), Alias::new("did"))
        .expr_as(Expr::col((Ms::Table, Ms::Provider)), Alias::new("provider"))
        .expr_as(Expr::col((Ms::Table, Ms::Enabled)), Alias::new("enabled"))
        .expr_as(
            Expr::col((Ms::Table, Ms::ExternalUsername)),
            Alias::new("external_username"),
        )
        .expr_as(
            Expr::col((Ms::Table, Ms::EncryptedApiKey)),
            Alias::new("encrypted_api_key"),
        )
        .expr_as(
            Expr::col((Ms::Table, Ms::LastScrobbleSeenAt)),
            Alias::new("last_scrobble_seen_at"),
        )
        .from(Ms::Table)
        .join(
            JoinType::Join,
            Users::Table,
            Expr::col((Users::Table, Users::XataId)).equals((Ms::Table, Ms::UserId)),
        )
        .to_owned()
}

/// Joined view of `mirror_sources` + user DID.
///
/// `last_scrobble_seen_at` is stored as Postgres `TIMESTAMP` (no time zone)
/// because that's what the Drizzle schema declares, so we decode it as
/// `NaiveDateTime` and lift to `DateTime<Utc>` at the call sites.
#[derive(Debug, Clone, FromRow)]
pub struct MirrorSourceRow {
    pub user_id: String,
    pub did: String,
    pub provider: String,
    pub enabled: bool,
    pub external_username: Option<String>,
    pub encrypted_api_key: Option<String>,
    pub last_scrobble_seen_at: Option<NaiveDateTime>,
}

impl MirrorSourceRow {
    /// `last_scrobble_seen_at` lifted into UTC. Stored in the DB without a
    /// time zone, but the mirror layer always treats times as UTC.
    pub fn last_scrobble_seen_at_utc(&self) -> Option<DateTime<Utc>> {
        self.last_scrobble_seen_at.map(|n| n.and_utc())
    }
}

pub async fn load_enabled(
    pool: &Backend,
    provider: Provider,
) -> Result<Vec<MirrorSourceRow>, Error> {
    let mut stmt = source_select();
    stmt.and_where(Expr::col((Ms::Table, Ms::Enabled)).eq(true))
        .and_where(Expr::col((Ms::Table, Ms::Provider)).eq(provider.as_str()));
    let rows = pool.fetch_all::<MirrorSourceRow>(&stmt).await?;
    Ok(rows)
}

pub async fn load_one(
    pool: &Backend,
    user_id: &str,
    provider: Provider,
) -> Result<Option<MirrorSourceRow>, Error> {
    let mut stmt = source_select();
    stmt.and_where(Expr::col((Ms::Table, Ms::UserId)).eq(user_id))
        .and_where(Expr::col((Ms::Table, Ms::Provider)).eq(provider.as_str()))
        .limit(1);
    let row = pool.fetch_optional::<MirrorSourceRow>(&stmt).await?;
    Ok(row)
}

pub async fn user_id_for_did(pool: &Backend, did: &str) -> Result<Option<String>, Error> {
    let row: Option<(String,)> = {
        let stmt = Query::select()
            .column(Users::XataId)
            .from(Users::Table)
            .and_where(Expr::col(Users::Did).eq(did))
            .limit(1)
            .to_owned();
        pool.fetch_optional(&stmt).await?
    };
    Ok(row.map(|(id,)| id))
}

/// Cached enrichment fields for a track already known to Rocksky. We key on
/// the same sha256(lowercase("title - artist - album")) the API computes in
/// `nowplaying.service.ts`, so a single point lookup hits the unique index.
#[derive(Debug, Default, FromRow)]
pub struct TrackEnrichment {
    pub album_art: Option<String>,
    pub spotify_link: Option<String>,
    pub isrc: Option<String>,
}

pub async fn track_enrichment(
    pool: &Backend,
    title: &str,
    artist: &str,
    album: &str,
) -> Result<Option<TrackEnrichment>, Error> {
    let sha = sha256::digest(
        format!("{title} - {artist} - {album}")
            .to_lowercase()
            .as_bytes(),
    );
    let stmt = Query::select()
        .columns([Tracks::AlbumArt, Tracks::SpotifyLink, Tracks::Isrc])
        .from(Tracks::Table)
        .and_where(Expr::col(Tracks::Sha256).eq(sha))
        .limit(1)
        .to_owned();
    let row: Option<TrackEnrichment> = pool.fetch_optional(&stmt).await?;
    Ok(row)
}

pub async fn touch_polled(
    pool: &Backend,
    user_id: &str,
    provider: Provider,
    last_scrobble_seen_at: Option<DateTime<Utc>>,
) -> Result<(), Error> {
    // `NOW()` has no SQLite spelling, and the text form has to match what
    // these columns hold.
    let now = Expr::cust(rocksky_db::models::now_sql(pool.dialect()));

    // The watermark is only moved forward when this poll actually saw a
    // scrobble: COALESCE keeps the stored value when the argument is NULL.
    let seen = rocksky_db::sea_query::Func::coalesce([
        seen_value(pool, last_scrobble_seen_at),
        Expr::col(Ms::LastScrobbleSeenAt).into(),
    ]);

    let update = Query::update()
        .table(Ms::Table)
        .value(Ms::LastPolledAt, now.clone())
        .value(Ms::LastScrobbleSeenAt, seen)
        .value(Ms::XataUpdatedat, now)
        .and_where(Expr::col(Ms::UserId).eq(user_id))
        .and_where(Expr::col(Ms::Provider).eq(provider.as_str()))
        .to_owned();

    pool.execute(&update).await?;
    Ok(())
}

/// A watermark timestamp, in the form this backend stores.
///
/// The column is Postgres `TIMESTAMP` (no zone), which is why the value is
/// bound as a `NaiveDateTime` rather than a `DateTime<Utc>` — sqlx encodes the
/// latter as `TIMESTAMPTZ` and the comparison would be against the wrong type.
/// SQLite holds the ISO-8601 text every other timestamp here is written in.
fn seen_value(pool: &Backend, at: Option<DateTime<Utc>>) -> rocksky_db::sea_query::SimpleExpr {
    let Some(at) = at else {
        return Option::<String>::None.into();
    };
    match pool.dialect() {
        rocksky_db::Dialect::Postgres => at.naive_utc().into(),
        rocksky_db::Dialect::Sqlite => rocksky_db::format_timestamp(at).into(),
    }
}
