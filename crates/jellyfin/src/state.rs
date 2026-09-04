use anyhow::Error;
use sqlx::{Pool, Postgres};
use std::sync::Arc;

use rocksky_navidrome::typesense::TypesenseClient;

pub struct AppState {
    pub pool: Arc<Pool<Postgres>>,
    /// Where now-playing goes. `run` always connects, so this is only ever
    /// `None` under test, where there is no broker to talk to and the playback
    /// endpoints are exercised for their HTTP behaviour alone.
    pub nc: Option<Arc<async_nats::Client>>,
    pub typesense: Arc<Option<TypesenseClient>>,
    /// Stable dashed-UUID id for this server, persisted in `jellyfin_meta`.
    /// Clients key their saved-server entry on it, so it must survive restarts.
    pub server_id: String,
    pub server_name: String,
    pub host: String,
    pub port: u16,
}

impl AppState {
    pub fn typesense(&self) -> Option<&TypesenseClient> {
        self.typesense.as_ref().as_ref()
    }
}

/// Look up — or mint once — the server id.
///
/// Clients built on the official Kotlin/Java SDKs parse this with
/// `UUID.fromString()`, so it has to be dashed just like an item id.
pub async fn ensure_server_id(pool: &Pool<Postgres>) -> Result<String, Error> {
    let existing: Option<(String,)> =
        sqlx::query_as(r#"SELECT value FROM jellyfin_meta WHERE key = 'server_id'"#)
            .fetch_optional(pool)
            .await?;
    if let Some((v,)) = existing {
        return Ok(v);
    }

    let id = crate::guid::guid("server", &crate::auth::random_hex(16));
    sqlx::query(
        r#"
        INSERT INTO jellyfin_meta (key, value) VALUES ('server_id', $1)
        ON CONFLICT (key) DO NOTHING
        "#,
    )
    .bind(&id)
    .execute(pool)
    .await?;

    // Re-read rather than returning `id`: another instance starting at the same
    // moment may have won the insert, and both must agree on the value.
    let (value,): (String,) =
        sqlx::query_as(r#"SELECT value FROM jellyfin_meta WHERE key = 'server_id'"#)
            .fetch_one(pool)
            .await?;
    Ok(value)
}
