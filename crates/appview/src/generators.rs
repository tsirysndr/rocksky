//! Seeding the feed registry from the publisher's repository.
//!
//! `app.rocksky.feed.getFeedGenerators` answers from the `feeds` table, and
//! nothing writes that table: the rows are a projection of
//! `app.rocksky.feed.generator` records, which live in the repository of the
//! account that publishes the feeds — `did:plc:vegqomyce4ssoqs7zwqvgqty` for
//! the ones rocksky.app serves.
//!
//! In the deployed system those rows arrive over the firehose. A self-hosted
//! instance has no reason to be following that account, so on a fresh database
//! the registry stays empty and the feed picker shows nothing — which looks
//! like the feeds are broken rather than absent.
//!
//! So the records are read directly, the same way [`crate::backfill`] reads a
//! repository: resolve the DID, ask its PDS for the collection, project each
//! record into a row. Idempotent — keyed on the record URI — so it can run on
//! every boot, and a feed renamed in the repository is renamed here too.

use crate::db::schema::Feeds;
use crate::db::{new_id, Backend};
use crate::sea_query::{Expr, OnConflict, Query};
use crate::state::AppState;

/// The collection the generator records live in.
pub const GENERATOR_COLLECTION: &str = "app.rocksky.feed.generator";

/// Most records to read from one repository.
///
/// The publisher has fifty-odd feeds; a thousand is far above any plausible
/// registry and bounds the walk if the DID is ever pointed somewhere unwise.
const MAX_GENERATORS: usize = 1000;

/// Reads the publisher's feed records and writes them into the registry.
///
/// Returns how many rows it wrote. Never fatal: a self-hosted instance that
/// cannot reach the publisher's PDS should still serve everything else, so a
/// failure is logged and the registry is left as it was.
pub async fn sync(state: &AppState) -> anyhow::Result<usize> {
    let did = state.config().feed_publisher_did.clone();
    if did.is_empty() {
        return Ok(0);
    }

    let pds =
        crate::atproto::resolve_pds(state.http(), &state.config().plc_directory_url, &did).await?;

    let records = crate::atproto::records::list_records(
        state.http(),
        &pds,
        &did,
        GENERATOR_COLLECTION,
        MAX_GENERATORS,
    )
    .await?;

    // The rows reference a user, and the publisher is not necessarily anyone
    // this instance has seen. Creating the row is the same idempotent upsert
    // the ingest path uses.
    let user_id = crate::ingest::upsert_user(state.db(), &did).await?;

    // `upsert_user` leaves the DID standing in for the handle, because a
    // record carries no profile. Every feed names this account as its creator,
    // so without resolving it the picker credits every feed to a raw DID.
    crate::rest::auth::sync_user(state, &did, None).await;

    let mut written = 0;
    for record in &records {
        match upsert(state.db(), &user_id, &did, &pds, record).await {
            Ok(()) => written += 1,
            // One malformed record must not cost the rest of the registry.
            Err(err) => {
                tracing::warn!(uri = %record.uri, error = ?err, "skipping a feed generator record")
            }
        }
    }

    tracing::info!(did = %did, feeds = written, "synced the feed registry");
    Ok(written)
}

/// Projects one record into a `feeds` row.
async fn upsert(
    db: &Backend,
    user_id: &str,
    did: &str,
    pds: &str,
    record: &crate::atproto::records::FetchedRecord,
) -> anyhow::Result<()> {
    let value = &record.value;

    let display_name = string(value, "displayName")
        // NOT NULL, and a feed with no name cannot be rendered. Falling back
        // to the record key gives the picker something usable rather than
        // dropping the feed.
        .or_else(|| rkey_of(&record.uri))
        .ok_or_else(|| anyhow::anyhow!("no displayName and no rkey"))?;

    let insert = Query::insert()
        .into_table(Feeds::Table)
        .columns([
            Feeds::XataId,
            Feeds::DisplayName,
            Feeds::Description,
            Feeds::Did,
            Feeds::Uri,
            Feeds::Avatar,
            Feeds::UserId,
        ])
        .values_panic([
            new_id().into(),
            display_name.clone().into(),
            string(value, "description").into(),
            // The record's own `did` is the *service* that serves the feed,
            // which is not the repository it lives in — a generator hosted
            // elsewhere is published from this account all the same.
            string(value, "did")
                .unwrap_or_else(|| did.to_string())
                .into(),
            record.uri.clone().into(),
            avatar_url(value, pds, did).into(),
            user_id.into(),
        ])
        // Keyed on the URI, so a re-run updates rather than duplicating, and a
        // feed renamed upstream is renamed here.
        .on_conflict(
            OnConflict::column(Feeds::Uri)
                .update_columns([
                    Feeds::DisplayName,
                    Feeds::Description,
                    Feeds::Did,
                    Feeds::Avatar,
                ])
                .value(Feeds::XataUpdatedat, crate::db::now_timestamp())
                .to_owned(),
        )
        .to_owned();

    db.execute(&insert).await?;
    Ok(())
}

/// The URL an avatar blob is served from.
///
/// A record carries the blob's CID, not a URL; the bytes come from the
/// repository's own PDS. Built here rather than stored as a CID because every
/// reader of this table is a UI that needs something to put in `src`.
fn avatar_url(value: &serde_json::Value, pds: &str, did: &str) -> Option<String> {
    let cid = value
        .get("avatar")?
        .get("ref")
        .and_then(|reference| reference.get("$link"))
        .and_then(|link| link.as_str())
        // A legacy blob carries its CID as a bare string.
        .or_else(|| value.get("avatar")?.get("cid").and_then(|cid| cid.as_str()))?;

    Some(format!(
        "{}/xrpc/com.atproto.sync.getBlob?did={did}&cid={cid}",
        pds.trim_end_matches('/')
    ))
}

fn string(value: &serde_json::Value, key: &str) -> Option<String> {
    value
        .get(key)?
        .as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(str::to_string)
}

/// The record key of an AT-URI.
fn rkey_of(uri: &str) -> Option<String> {
    uri.rsplit('/')
        .next()
        .filter(|k| !k.is_empty())
        .map(str::to_string)
}

/// How many generators the registry holds.
pub async fn count(db: &Backend) -> Result<i64, sqlx::Error> {
    let query = Query::select()
        .expr(db.cast_int(crate::sea_query::Func::count(Expr::col(Feeds::XataId))))
        .from(Feeds::Table)
        .to_owned();
    db.count(&query).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::atproto::records::FetchedRecord;

    fn record(uri: &str, value: serde_json::Value) -> FetchedRecord {
        FetchedRecord {
            uri: uri.to_string(),
            cid: Some("bafy".into()),
            value,
        }
    }

    /// The registry is a projection of records, so a re-run must update rather
    /// than duplicate — it happens on every boot.
    #[tokio::test]
    async fn syncing_twice_updates_rather_than_duplicating() {
        let db = crate::db::connect_in_memory().await.unwrap();
        let user = crate::ingest::upsert_user(&db, "did:plc:publisher")
            .await
            .unwrap();

        let uri = "at://did:plc:publisher/app.rocksky.feed.generator/metalcore";
        upsert(
            &db,
            &user,
            "did:plc:publisher",
            "https://pds.example",
            &record(
                uri,
                serde_json::json!({ "displayName": "Metalcore", "description": "Heavy" }),
            ),
        )
        .await
        .unwrap();

        assert_eq!(count(&db).await.unwrap(), 1);

        // The same feed, renamed upstream.
        upsert(
            &db,
            &user,
            "did:plc:publisher",
            "https://pds.example",
            &record(
                uri,
                serde_json::json!({ "displayName": "Metalcore 2", "description": "Heavier" }),
            ),
        )
        .await
        .unwrap();

        assert_eq!(count(&db).await.unwrap(), 1, "the URI is the key");

        let name = db
            .fetch_scalar::<String>(
                &Query::select()
                    .column(Feeds::DisplayName)
                    .from(Feeds::Table)
                    .and_where(Expr::col(Feeds::Uri).eq(uri))
                    .to_owned(),
            )
            .await
            .unwrap();
        assert_eq!(name.as_deref(), Some("Metalcore 2"));
    }

    /// `display_name` is NOT NULL, and dropping a feed because its record has
    /// no name would silently shrink the registry.
    #[tokio::test]
    async fn a_record_without_a_name_falls_back_to_its_rkey() {
        let db = crate::db::connect_in_memory().await.unwrap();
        let user = crate::ingest::upsert_user(&db, "did:plc:publisher")
            .await
            .unwrap();

        upsert(
            &db,
            &user,
            "did:plc:publisher",
            "https://pds.example",
            &record(
                "at://did:plc:publisher/app.rocksky.feed.generator/vaporwave",
                serde_json::json!({}),
            ),
        )
        .await
        .unwrap();

        let name = db
            .fetch_scalar::<String>(
                &Query::select()
                    .column(Feeds::DisplayName)
                    .from(Feeds::Table)
                    .to_owned(),
            )
            .await
            .unwrap();
        assert_eq!(name.as_deref(), Some("vaporwave"));
    }

    /// The UI puts this straight into an `<img src>`, so it has to be a URL.
    #[test]
    fn an_avatar_blob_becomes_a_fetchable_url() {
        let value = serde_json::json!({
            "avatar": { "$type": "blob", "ref": { "$link": "bafyavatar" } }
        });
        assert_eq!(
            avatar_url(&value, "https://pds.example/", "did:plc:publisher").as_deref(),
            Some("https://pds.example/xrpc/com.atproto.sync.getBlob?did=did:plc:publisher&cid=bafyavatar")
        );

        // A record with no avatar is normal, not an error.
        assert_eq!(
            avatar_url(&serde_json::json!({}), "https://pds", "did:x"),
            None
        );
    }

    /// The record's `did` names the service that serves the feed, which need
    /// not be the repository holding the record.
    #[tokio::test]
    async fn the_service_did_is_taken_from_the_record_when_present() {
        let db = crate::db::connect_in_memory().await.unwrap();
        let user = crate::ingest::upsert_user(&db, "did:plc:publisher")
            .await
            .unwrap();

        upsert(
            &db,
            &user,
            "did:plc:publisher",
            "https://pds.example",
            &record(
                "at://did:plc:publisher/app.rocksky.feed.generator/rock",
                serde_json::json!({ "displayName": "Rock", "did": "did:web:feeds.rocksky.app" }),
            ),
        )
        .await
        .unwrap();

        let served_by = db
            .fetch_scalar::<String>(
                &Query::select()
                    .column(Feeds::Did)
                    .from(Feeds::Table)
                    .to_owned(),
            )
            .await
            .unwrap();
        assert_eq!(served_by.as_deref(), Some("did:web:feeds.rocksky.app"));
    }
}
