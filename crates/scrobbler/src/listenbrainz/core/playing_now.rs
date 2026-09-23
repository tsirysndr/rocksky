//! `GET /1/user/{user_name}/playing-now` — what is on right now.
//!
//! # Where it comes from
//!
//! Nothing in the database holds a now-playing track: a listen becomes a row
//! only once it has been played long enough to scrobble. So this reads two
//! Redis keys, in order:
//!
//! 1. `listenbrainz:playing_now:{did}` — written here, by the `playing_now`
//!    submission a ListenBrainz client sends when a track starts. It is the
//!    only source for someone scrobbling *from* such a client, which is the
//!    case this endpoint exists for.
//! 2. `nowplaying:{did}` — written by `remote-ws` for the user's primary
//!    device, and the source for someone listening on a Rocksky player. It
//!    carries a three-second TTL because players re-push constantly, so it is
//!    present exactly while something is actually playing.
//!
//! The first wins when both are set: a client that is submitting listens is
//! describing the stream it is scrobbling, and that is the one its own screen
//! should agree with.
//!
//! # Why the key expires with the track
//!
//! ListenBrainz clears a now-playing when the track would have ended. Ours
//! expires with the submitted duration plus a minute of slack, so a client
//! that stops without saying so does not leave a track pinned to the profile
//! forever. With no duration the fallback is ten minutes — longer than any
//! gap between two `playing_now` submissions, shorter than a stale track is
//! tolerable for.

use anyhow::Error;
use rocksky_db::models::User;
use serde_json::Value;

use crate::cache::Cache;
use crate::listenbrainz::msid;
use crate::listenbrainz::types::{
    Listen, ListenAdditionalInfo, ListenTrackMetadata, ListensPayload, ListensResponse,
    MbidMapping, SubmitListensRequest,
};

/// Slack added to the track's own duration, so a client that submits a little
/// late does not blink the track off the profile in between.
const SLACK_SECONDS: i64 = 60;
const NO_DURATION_TTL: i64 = 600;
const MAX_TTL: i64 = 1800;

fn key(did: &str) -> String {
    format!("listenbrainz:playing_now:{}", did)
}

/// Records the `playing_now` submission a client has just sent.
///
/// Failures are logged and swallowed: a now-playing that did not reach Redis
/// costs one screen a line of text, and it must not fail the submission that
/// carried it.
pub fn remember(cache: &Cache, did: &str, user_name: &str, request: &SubmitListensRequest) {
    let Some(payload) = request.payload.first() else {
        return;
    };
    let meta = &payload.track_metadata;
    let info = meta.additional_info.as_ref();
    let duration_ms = info.and_then(|info| info.duration_ms());

    let listen = Listen {
        listened_at: None,
        inserted_at: Some(chrono::Utc::now().timestamp()),
        playing_now: Some(true),
        recording_msid: msid::from_sha256(&msid::track_sha256(
            &meta.track_name,
            &meta.artist_name,
            meta.release_name.as_deref().unwrap_or_default(),
        )),
        user_name: user_name.to_string(),
        track_metadata: ListenTrackMetadata {
            artist_name: meta.artist_name.clone(),
            track_name: meta.track_name.clone(),
            release_name: meta.release_name.clone(),
            additional_info: Some(ListenAdditionalInfo {
                duration_ms,
                recording_msid: None,
                submission_client: info.and_then(|info| info.submission_client.clone()),
                submission_client_version: info
                    .and_then(|info| info.submission_client_version())
                    .map(str::to_string),
                music_service_name: info.and_then(|info| info.media_player.clone()),
                ..Default::default()
            }),
            mbid_mapping: info.and_then(|info| info.musicbrainz_track_id.clone()).map(
                |recording_mbid| MbidMapping {
                    recording_mbid: Some(recording_mbid),
                    release_mbid: None,
                    artist_mbids: None,
                },
            ),
        },
    };

    let ttl = duration_ms
        .map(|ms| ms / 1000 + SLACK_SECONDS)
        .unwrap_or(NO_DURATION_TTL)
        .clamp(SLACK_SECONDS, MAX_TTL);

    match serde_json::to_string(&listen) {
        Ok(json) => {
            if let Err(err) = cache.setex(&key(did), &json, ttl as usize) {
                tracing::warn!(error = %err, did = %did, "could not cache the now-playing listen");
            }
        }
        Err(err) => tracing::warn!(error = %err, "could not encode the now-playing listen"),
    }
}

/// Stops reporting a now-playing for `did`.
pub fn forget(cache: &Cache, did: &str) {
    if let Err(err) = cache.del(&key(did)) {
        tracing::warn!(error = %err, did = %did, "could not clear the now-playing listen");
    }
}

pub fn get_playing_now(cache: &Cache, user: &User) -> Result<ListensResponse, Error> {
    let listen = submitted(cache, user).or_else(|| from_rocksky_player(cache, user));
    let playing = listen.is_some();

    Ok(ListensResponse {
        payload: ListensPayload {
            count: listen.iter().count(),
            listens: listen.into_iter().collect(),
            latest_listen_ts: None,
            oldest_listen_ts: None,
            playing_now: Some(playing),
            user_id: user.handle.clone(),
        },
    })
}

/// The listen a ListenBrainz client submitted as `playing_now`.
fn submitted(cache: &Cache, user: &User) -> Option<Listen> {
    let json = cache.get(&key(&user.did)).ok().flatten()?;
    let mut listen: Listen = serde_json::from_str(&json)
        .map_err(|err| tracing::warn!(error = %err, "discarding a malformed cached now-playing"))
        .ok()?;
    // Cached before the handle was known in some paths, and cheap to correct.
    listen.user_name = user.handle.clone();
    listen.playing_now = Some(true);
    Some(listen)
}

/// The track a Rocksky player is pushing, if one is.
///
/// `remote-ws` writes an enriched blob whose field names are the player's, not
/// ListenBrainz's, so it is read defensively: anything missing the artist or
/// the title is not a track worth reporting. A paused player is reported as
/// nothing rather than as playing.
fn from_rocksky_player(cache: &Cache, user: &User) -> Option<Listen> {
    let json = cache
        .get(&format!("nowplaying:{}", user.did))
        .ok()
        .flatten()?;
    let track: Value = serde_json::from_str(&json).ok()?;

    if track.get("is_playing").and_then(Value::as_bool) == Some(false) {
        return None;
    }

    let text = |field: &str| {
        track
            .get(field)
            .and_then(Value::as_str)
            .map(str::to_string)
            .filter(|value| !value.trim().is_empty())
    };

    let artist_name = text("artist")?;
    let track_name = text("title")?;
    let release_name = text("album");

    // Both spellings are milliseconds; `remote-ws` reads them in this order
    // too, and players differ only in which one they send.
    let duration_ms = ["duration_ms", "duration"]
        .iter()
        .find_map(|field| track.get(*field).and_then(Value::as_i64))
        .filter(|ms| *ms > 0);

    let sha256 = text("sha256").unwrap_or_else(|| {
        msid::track_sha256(
            &track_name,
            &artist_name,
            release_name.as_deref().unwrap_or_default(),
        )
    });

    Some(Listen {
        listened_at: None,
        inserted_at: None,
        playing_now: Some(true),
        recording_msid: msid::from_sha256(&sha256),
        user_name: user.handle.clone(),
        track_metadata: ListenTrackMetadata {
            artist_name,
            track_name,
            release_name,
            additional_info: Some(ListenAdditionalInfo {
                duration_ms,
                music_service_name: text("device_name"),
                ..Default::default()
            }),
            mbid_mapping: None,
        },
    })
}
