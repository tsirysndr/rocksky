use anyhow::Error;
use rocksky_navidrome::sql;
use rocksky_navidrome::typesense::TypesenseClient;
use rocksky_pgurl::Db;
use sea_query::{Expr, OnConflict, Query};
use std::sync::Arc;

use crate::schema::JellyfinMeta;

pub struct AppState {
    pub pool: Arc<Db>,
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
pub async fn ensure_server_id(db: &Db) -> Result<String, Error> {
    let pool = db.primary();
    let lookup = || {
        Query::select()
            .column(JellyfinMeta::Value)
            .from(JellyfinMeta::Table)
            .and_where(Expr::col(JellyfinMeta::Key).eq(SERVER_ID))
            .take()
    };

    if let Some(value) = sql::fetch_scalar_optional::<String>(pool, &lookup()).await? {
        return Ok(value);
    }

    let id = crate::guid::guid("server", &crate::auth::random_hex(16));
    let insert = Query::insert()
        .into_table(JellyfinMeta::Table)
        .columns([JellyfinMeta::Key, JellyfinMeta::Value])
        .values_panic([SERVER_ID.into(), id.into()])
        .on_conflict(
            OnConflict::column(JellyfinMeta::Key)
                .do_nothing()
                .to_owned(),
        )
        .to_owned();
    sql::execute(pool, &insert).await?;

    // Re-read rather than returning `id`: another instance starting at the same
    // moment may have won the insert, and both must agree on the value.
    Ok(sql::fetch_scalar(pool, &lookup()).await?)
}

const SERVER_ID: &str = "server_id";
