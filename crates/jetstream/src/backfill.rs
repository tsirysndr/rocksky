//! Re-projecting the likes that already exist in users' repositories.
//!
//! Live likes are covered from the moment the jetstream subscriber starts
//! handling `app.rocksky.like` — but every like recorded before then is only
//! in the repository it was written to, and the liked counts in the database
//! say nobody ever liked anything. Re-liking would fix a user's own counts,
//! which is not an acceptable ask.
//!
//! So this walks the repos of every DID the database already knows and hands
//! each `app.rocksky.like` record through the same projection the live
//! stream uses ([`crate::like::save_like`]). That is what makes it
//! idempotent: the projection dedupes on the record's AT-URI, so running it
//! again — or running it while the live stream is also running — cannot
//! double-count a like. It is safe to re-run after a partial failure, and a
//! like whose song is not indexed yet is skipped and left for the next pass.
//!
//! Only likes are read here, never written to the repositories: `listRecords`
//! is a read, and nothing in this module creates or deletes a record.

use std::time::Duration;

use anyhow::Error;
use rocksky_db::exec as sql;
use sea_query::Query;

use crate::like::save_like;
use crate::profile::did_to_pds;
use crate::schema::Users;
use crate::subscriber::LIKE_NSID;
use crate::types::LikeRecord;

/// Page size for `com.atproto.repo.listRecords`. The maximum is 100.
const PAGE_LIMIT: &str = "100";

/// Backfills likes for every DID known to this deployment.
///
/// One repository failing must not stop the rest — a DID that no longer
/// resolves, or a PDS having a bad moment, says nothing about the others.
pub async fn run() -> Result<(), Error> {
    // The writes here go to the primary, like the live subscriber's. A small
    // pool: this walks pages of likes, not a firehose.
    let db = rocksky_pgurl::connect_handle("rocksky-like-backfill", |opts| {
        opts.max_connections(4)
            .min_connections(1)
            .acquire_timeout(Duration::from_secs(10))
            .test_before_acquire(true)
    })
    .await?;
    let pool = db.primary().clone();

    let nats_addr =
        std::env::var("NATS_URL").unwrap_or_else(|_| "nats://localhost:4222".to_string());
    let nc = async_nats::connect(&nats_addr).await?;

    // Bounded, so a slow PDS slows the walk rather than hanging it.
    let http = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(15))
        .build()?;

    let dids: Vec<String> = sql::fetch_scalars(
        &pool,
        &Query::select().column(Users::Did).from(Users::Table).take(),
    )
    .await?;

    tracing::info!(
        repositories = dids.len(),
        "Backfilling likes from repositories"
    );

    let mut projected = 0u64;
    let mut failed = 0u64;
    for did in &dids {
        match backfill_repo(&pool, &nc, &http, did).await {
            Ok(likes) => {
                projected += likes;
                tracing::info!(did = %did, likes, "Repository backfilled");
            }
            Err(err) => {
                failed += 1;
                tracing::error!(did = %did, error = %err, "Like backfill failed for repository");
            }
        }
    }

    tracing::info!(
        projected,
        repositories = dids.len(),
        failed,
        "Like backfill complete"
    );
    Ok(())
}

/// Backfills one repository, returning how many likes were newly projected.
async fn backfill_repo(
    pool: &rocksky_db::Backend,
    nc: &async_nats::Client,
    http: &reqwest::Client,
    did: &str,
) -> Result<u64, Error> {
    let pds = did_to_pds(did).await?;
    let client = http;

    let mut projected = 0u64;
    let mut cursor: Option<String> = None;

    loop {
        let mut params = vec![
            ("repo", did.to_string()),
            ("collection", LIKE_NSID.to_string()),
            ("limit", PAGE_LIMIT.to_string()),
        ];
        if let Some(cursor) = &cursor {
            params.push(("cursor", cursor.clone()));
        }

        let response = client
            .get(format!("{}/xrpc/com.atproto.repo.listRecords", pds))
            .query(&params)
            .header("Accept", "application/json")
            .send()
            .await?;

        if !response.status().is_success() {
            anyhow::bail!(
                "listRecords answered {}: {}",
                response.status(),
                response.text().await.unwrap_or_default()
            );
        }

        let body: serde_json::Value = response.json().await?;
        let records = body["records"]
            .as_array()
            .ok_or_else(|| anyhow::anyhow!("listRecords returned no records array"))?;

        if records.is_empty() {
            break;
        }

        for record in records {
            let Some(rkey) = record["uri"]
                .as_str()
                .and_then(|uri| uri.rsplit('/').next())
            else {
                tracing::warn!(did = %did, "A like record has no parsable URI");
                continue;
            };

            let Ok(like) = serde_json::from_value::<LikeRecord>(record["value"].clone()) else {
                tracing::warn!(did = %did, rkey = %rkey, "Malformed like record");
                continue;
            };

            match save_like(pool, nc, did, rkey, &like).await {
                Ok(true) => projected += 1,
                Ok(false) => {}
                Err(err) => {
                    tracing::error!(did = %did, rkey = %rkey, error = %err, "Could not project a like");
                }
            }
        }

        cursor = body["cursor"].as_str().map(str::to_string);
        if cursor.is_none() {
            break;
        }
    }

    Ok(projected)
}
