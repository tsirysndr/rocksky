use crate::auth::decode_token;
use crate::musicbrainz::client::MusicbrainzClient;
use crate::repo;
use crate::{cache::Cache, scrobbler::scrobble_listenbrainz};
use anyhow::Error;
use owo_colors::OwoColorize;
use rocksky_db::Backend;
use std::sync::Arc;

use crate::listenbrainz::msid;
use crate::listenbrainz::types::{SubmitListensRequest, SubmitResponse};

/// The MSID this listen will be known by once it is in the catalogue.
///
/// Computed from the submitted metadata rather than looked up, because the
/// row does not exist yet: the hash is the same one ingest will derive, so
/// the two agree without a round trip.
pub fn submitted_msid(payload: &SubmitListensRequest) -> Option<String> {
    let meta = &payload.payload.first()?.track_metadata;
    msid::from_sha256(&msid::track_sha256(
        &meta.track_name,
        &meta.artist_name,
        meta.release_name.as_deref().unwrap_or_default(),
    ))
}

pub async fn submit_listens(
    payload: SubmitListensRequest,
    cache: &Cache,
    pool: &Arc<Backend>,
    mb_client: &Arc<MusicbrainzClient>,
    token: &str,
) -> Result<SubmitResponse, Error> {
    if payload.listen_type != "single" {
        let artist = payload.payload[0].track_metadata.artist_name.clone();
        let track = payload.payload[0].track_metadata.track_name.clone();
        tracing::info!(listen_type = %payload.listen_type.cyan(), artist = %artist, track = %track, "Skipping listen type");

        return Ok(SubmitResponse::ignored());
    }

    let pool = Arc::clone(pool);
    let cache = cache.clone();
    let mb_client = Arc::clone(mb_client);
    let payload = payload.clone();
    let token = token.to_string();
    tokio::spawn(async move {
        const RETRIES: usize = 15;
        for attempt in 1..=RETRIES {
            match scrobble_listenbrainz(&pool, &cache, &mb_client, &payload, &token).await {
                Ok(_) => {
                    tracing::info!("Successfully submitted listens");
                    break;
                }
                Err(e) => {
                    let artist = payload.payload[0].track_metadata.artist_name.clone();
                    let track = payload.payload[0].track_metadata.track_name.clone();

                    let did = match decode_token(&token) {
                        Ok(claims) => claims.did,
                        Err(_) => match repo::user::get_user_by_apikey(&pool, &token).await {
                            Ok(Some(user)) => user.did,
                            _ => {
                                tracing::error!("Failed to get user DID, giving up");
                                break;
                            }
                        },
                    };

                    if let Err(ce) =
                        cache.del(&format!("listenbrainz:cache:{}:{}:{}", artist, track, did))
                    {
                        tracing::error!(error = %ce, "Failed to clear scrobble cache");
                    }

                    tracing::error!(error = %e, attempt = attempt, "Retryable error submitting listens for {} - {} (attempt {}/{})", artist, track, attempt, RETRIES);

                    if attempt == RETRIES {
                        tracing::error!(
                            "Max retries reached, giving up on submitting listens for {} - {}",
                            artist,
                            track
                        );
                        break;
                    }

                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                }
            }
        }
    });

    Ok(SubmitResponse::accepted(None))
}
