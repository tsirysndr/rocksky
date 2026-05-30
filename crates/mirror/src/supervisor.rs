//! Task supervisor: keeps one tokio task per enabled (provider, user) row for
//! Last.fm / ListenBrainz, and one shared task for Teal.fm. NATS messages on
//! [`crate::MIRROR_NATS_TOPIC`] (payload: `"<provider>:<user_id>"`) trigger
//! reconciliation for a single (provider, user_id).

use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Error};
use async_nats::connect;
use futures_util::StreamExt;
use owo_colors::OwoColorize;
use reqwest::Client;
use sqlx::{Pool, Postgres};
use tokio::sync::RwLock;
use tokio_util::sync::CancellationToken;
use tracing::{error, info, warn};

use crate::{
    creds::CredentialPool, db, enrich::Enricher, lastfm, listenbrainz, tealfm, Provider,
    MIRROR_NATS_TOPIC,
};

type TaskMap = Arc<RwLock<HashMap<(Provider, String), CancellationToken>>>;

pub async fn run() -> Result<(), Error> {
    let pool = db::connect().await.context("DB connect")?;
    let http = Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent("rocksky-mirror/0.1")
        .build()?;

    let tasks: TaskMap = Arc::new(RwLock::new(HashMap::new()));
    let tealfm_enabled: tealfm::EnabledDids = Arc::new(RwLock::new(HashSet::new()));

    // Credential rotation pool for Spotify + Last.fm enrichment APIs.
    let creds = CredentialPool::new();
    creds.refresh(&pool).await;
    creds.spawn_refresher(pool.clone());
    let enricher = Enricher::new(creds);

    // Initial reconcile: bring all currently enabled (provider, user_id) rows
    // into a running state.
    for provider in [Provider::Lastfm, Provider::Listenbrainz, Provider::Tealfm] {
        let rows = db::load_enabled(&pool, provider).await?;
        info!(
            provider = provider.as_str(),
            count = rows.len(),
            "supervisor: hydrating enabled mirror sources"
        );
        for row in rows {
            spawn_for(
                provider,
                pool.clone(),
                http.clone(),
                enricher.clone(),
                row,
                tasks.clone(),
                tealfm_enabled.clone(),
            )
            .await;
        }
    }

    // Always run the shared Teal.fm jetstream subscriber — it filters by the
    // shared `tealfm_enabled` DID set, so an empty set just means we drop
    // every event cheaply.
    {
        let pool = pool.clone();
        let http = http.clone();
        let enricher = enricher.clone();
        let enabled = tealfm_enabled.clone();
        let cancel = CancellationToken::new();
        tokio::spawn(async move {
            if let Err(e) = tealfm::run(pool, http, enricher, enabled, cancel).await {
                error!(error = %e, "Teal.fm: subscriber exited");
            }
        });
    }

    // React to toggle events from the API.
    let nats_url = std::env::var("NATS_URL").unwrap_or_else(|_| "nats://localhost:4222".into());
    let nc = connect(&nats_url)
        .await
        .with_context(|| format!("connecting to NATS at {nats_url}"))?;
    info!(addr = %nats_url.bright_green(), "supervisor: connected to NATS");
    let mut sub = nc.subscribe(MIRROR_NATS_TOPIC.to_string()).await?;
    info!(topic = %MIRROR_NATS_TOPIC.bright_green(), "supervisor: subscribed");

    while let Some(msg) = sub.next().await {
        let payload = match std::str::from_utf8(&msg.payload) {
            Ok(s) => s.to_string(),
            Err(e) => {
                warn!(error = %e, "supervisor: non-utf8 NATS payload");
                continue;
            }
        };
        let Some((provider_str, user_id)) = payload.split_once(':') else {
            warn!(
                payload,
                "supervisor: malformed payload, expected `provider:user_id`"
            );
            continue;
        };
        let Some(provider) = Provider::parse(provider_str) else {
            warn!(payload, "supervisor: unknown provider");
            continue;
        };

        info!(
            provider = provider.as_str(),
            user_id, "supervisor: reconciling"
        );
        if let Err(e) = reconcile(
            provider,
            user_id.to_string(),
            pool.clone(),
            http.clone(),
            enricher.clone(),
            tasks.clone(),
            tealfm_enabled.clone(),
        )
        .await
        {
            error!(error = %e, "supervisor: reconcile failed");
        }
    }

    Ok(())
}

async fn reconcile(
    provider: Provider,
    user_id: String,
    pool: Pool<Postgres>,
    http: Client,
    enricher: Enricher,
    tasks: TaskMap,
    tealfm_enabled: tealfm::EnabledDids,
) -> Result<(), Error> {
    let row = db::load_one(&pool, &user_id, provider).await?;
    let key = (provider, user_id.clone());

    match row {
        Some(r) if r.enabled => {
            // Restart-style reconcile: cancel any existing task before
            // starting a fresh one, so updated credentials are picked up.
            cancel_task(&tasks, &key).await;
            spawn_for(provider, pool, http, enricher, r, tasks, tealfm_enabled).await;
        }
        _ => {
            cancel_task(&tasks, &key).await;
            if let Provider::Tealfm = provider {
                if let Some(r) = row {
                    tealfm_enabled.write().await.remove(&r.did);
                }
            }
            info!(
                provider = provider.as_str(),
                user_id, "supervisor: stopped (disabled or missing)"
            );
        }
    }
    Ok(())
}

async fn cancel_task(tasks: &TaskMap, key: &(Provider, String)) {
    if let Some(cancel) = tasks.write().await.remove(key) {
        cancel.cancel();
    }
}

async fn spawn_for(
    provider: Provider,
    pool: Pool<Postgres>,
    http: Client,
    enricher: Enricher,
    row: db::MirrorSourceRow,
    tasks: TaskMap,
    tealfm_enabled: tealfm::EnabledDids,
) {
    match provider {
        Provider::Tealfm => {
            // Teal.fm has no per-user task — we just register the DID with
            // the shared subscriber.
            tealfm_enabled.write().await.insert(row.did.clone());
            info!(
                did = %row.did,
                user_id = %row.user_id,
                "Teal.fm: enabled DID registered"
            );
        }
        Provider::Lastfm | Provider::Listenbrainz => {
            let cancel = CancellationToken::new();
            tasks
                .write()
                .await
                .insert((provider, row.user_id.clone()), cancel.clone());

            let pool_c = pool.clone();
            let http_c = http.clone();
            let enricher_c = enricher.clone();
            let user_id_c = row.user_id.clone();
            tokio::spawn(async move {
                let result = match provider {
                    Provider::Lastfm => {
                        lastfm::run_user(pool_c, http_c, enricher_c, row, cancel).await
                    }
                    Provider::Listenbrainz => {
                        listenbrainz::run_user(pool_c, http_c, enricher_c, row, cancel).await
                    }
                    Provider::Tealfm => unreachable!(),
                };
                if let Err(e) = result {
                    error!(
                        provider = provider.as_str(),
                        user_id = %user_id_c,
                        error = %e,
                        "supervisor: per-user task exited with error"
                    );
                }
            });
        }
    }
}
