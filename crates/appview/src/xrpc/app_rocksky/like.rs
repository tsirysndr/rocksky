//! `app.rocksky.like.*` — liking a song or a shout.
//!
//! These are the first XRPC procedures beyond scrobbling, and they set the
//! pattern the rest follow: write the record to the user's repository, then
//! project the row locally.
//!
//! # The strong ref
//!
//! An `app.rocksky.like` record does not name its subject by URI alone — it
//! carries a `com.atproto.repo.strongRef`, which is a URI *and* the CID of the
//! record at that URI. That pins the like to one exact version of the song: if
//! the song record is later rewritten, the like still points at what was
//! actually liked.
//!
//! The appview does not store CIDs, so the ref has to be fetched from the
//! subject's own repository with `getRecord`. That is one extra round trip per
//! like, and there is no way around it short of storing every record's CID.
//!
//! # Order of work
//!
//! The record goes first and the row second. If the record write fails there
//! is nothing to undo; if the row write fails the record still exists and the
//! next sync picks it up. The reverse order would leave a local like that no
//! other client can see.

use crate::atproto::writer::Writer;
use crate::auth::AuthDid;
use crate::db::models::{Track, TRACK_COLS};
use crate::db::schema::{LovedTracks, ShoutLikes, Shouts, Tracks, Users};
use crate::db::{new_id, Backend};
use crate::error::{XrpcError, XrpcResult};
use crate::sea_query::{Expr, Query};
use crate::state::AppState;
use crate::xrpc::ok_empty;
use crate::xrpc_procedure;
use actix_web::web::{self, ServiceConfig};
use actix_web::HttpResponse;
use serde::{Deserialize, Serialize};

pub fn configure(cfg: &mut ServiceConfig) {
    xrpc_procedure!(cfg, "app.rocksky.like.likeSong", like_song);
    xrpc_procedure!(cfg, "app.rocksky.like.dislikeSong", dislike_song);
    xrpc_procedure!(cfg, "app.rocksky.like.likeShout", like_shout);
    xrpc_procedure!(cfg, "app.rocksky.like.dislikeShout", dislike_shout);
}

/// The collection a like is recorded in.
const LIKE_COLLECTION: &str = "app.rocksky.like";

#[derive(Debug, Clone, Deserialize)]
pub struct LikeInput {
    #[serde(default, with = "crate::views::uri")]
    pub uri: Option<String>,
}

/// A `com.atproto.repo.strongRef`: a record's URI and the CID it had.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StrongRef {
    pub uri: String,
    pub cid: String,
}

/// An `app.rocksky.like` record.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LikeRecord {
    #[serde(rename = "$type")]
    pub record_type: &'static str,
    pub subject: StrongRef,
    pub created_at: String,
}

impl LikeRecord {
    fn new(subject: StrongRef) -> Self {
        Self {
            record_type: LIKE_COLLECTION,
            subject,
            created_at: crate::views::timestamp::to_iso8601(&chrono::Utc::now()),
        }
    }
}

/// `app.rocksky.like.likeSong`
async fn like_song(
    state: web::Data<AppState>,
    auth: AuthDid,
    body: web::Json<LikeInput>,
) -> XrpcResult<HttpResponse> {
    let uri = required_uri(&body)?;
    let db = state.db();

    let track = find_track(db, &uri)
        .await?
        .ok_or_else(|| XrpcError::invalid_request("No song at that URI").named("TrackNotFound"))?;
    let user_id = caller_id(db, &auth.did).await?;

    // Already liked: answer success rather than writing a second record. The
    // UI toggles, so a double-click must not produce two likes.
    if existing_like(db, &user_id, &track.id).await?.is_some() {
        tracing::debug!(did = %auth.did, uri = %uri, "already liked; nothing written");
        return ok_empty();
    }

    let subject = strong_ref(&state, &uri).await?;
    let writer = Writer::for_did(&state, &auth.did).await?;
    let rkey = crate::atproto::records::next_tid();
    let written = writer
        .create(LIKE_COLLECTION, &rkey, &LikeRecord::new(subject))
        .await?;

    let like_id = new_id();
    let insert = Query::insert()
        .into_table(LovedTracks::Table)
        .columns([
            LovedTracks::XataId,
            LovedTracks::UserId,
            LovedTracks::TrackId,
            LovedTracks::Uri,
        ])
        .values_panic([
            like_id.clone().into(),
            user_id.clone().into(),
            track.id.clone().into(),
            written.uri.clone().into(),
        ])
        .to_owned();
    db.execute(&insert).await?;

    tracing::info!(did = %auth.did, title = %track.title, "liked a song");

    // The mirrors push this to Last.fm and ListenBrainz; without the event
    // they never learn about it.
    if let Some(events) = state.events() {
        let now = crate::views::timestamp::to_iso8601(&chrono::Utc::now());
        events
            .publish_json(
                crate::events::subject::LIKE,
                &crate::events::LikeEvent {
                    uri: Some(written.uri.clone()),
                    user_id: crate::events::XataRef::new(&user_id),
                    track_id: crate::events::XataRef::new(&track.id),
                    xata_id: like_id,
                    xata_createdat: now.clone(),
                    xata_updatedat: now,
                    xata_version: 0,
                },
            )
            .await;
    }

    ok_empty()
}

/// `app.rocksky.like.dislikeSong`
///
/// Removes the like. Not "dislike" in the sense of a negative signal — the
/// lexicon's name is a misnomer that the UI's toggle inherited.
async fn dislike_song(
    state: web::Data<AppState>,
    auth: AuthDid,
    body: web::Json<LikeInput>,
) -> XrpcResult<HttpResponse> {
    let uri = required_uri(&body)?;
    let db = state.db();

    let Some(track) = find_track(db, &uri).await? else {
        // Nothing to unlike, which is the state the caller wanted.
        return ok_empty();
    };
    let user_id = caller_id(db, &auth.did).await?;

    let Some(like_uri) = existing_like(db, &user_id, &track.id).await? else {
        return ok_empty();
    };

    // The record is removed first. If that fails the row stays, and the like
    // is still true — which is better than a row saying otherwise.
    if let Some(rkey) = rkey_of(&like_uri) {
        let writer = Writer::for_did(&state, &auth.did).await?;
        writer.delete(LIKE_COLLECTION, &rkey).await?;
    }

    let delete = Query::delete()
        .from_table(LovedTracks::Table)
        .and_where(Expr::col(LovedTracks::UserId).eq(&user_id))
        .and_where(Expr::col(LovedTracks::TrackId).eq(&track.id))
        .to_owned();
    db.execute(&delete).await?;

    tracing::info!(did = %auth.did, title = %track.title, "unliked a song");

    if let Some(events) = state.events() {
        let now = crate::views::timestamp::to_iso8601(&chrono::Utc::now());
        events
            .publish_json(
                crate::events::subject::UNLIKE,
                &crate::events::LikeEvent {
                    uri: Some(like_uri.clone()),
                    user_id: crate::events::XataRef::new(&user_id),
                    track_id: crate::events::XataRef::new(&track.id),
                    // The row is gone, so there is no id to report; the
                    // subscribers match on the uri.
                    xata_id: String::new(),
                    xata_createdat: now.clone(),
                    xata_updatedat: now,
                    xata_version: 0,
                },
            )
            .await;
    }

    ok_empty()
}

/// `app.rocksky.like.likeShout`
///
/// A shout is a comment, and its likes are counted in `shout_likes` rather
/// than `loved_tracks` — the two are unrelated tables despite sharing a
/// lexicon namespace.
async fn like_shout(
    state: web::Data<AppState>,
    auth: AuthDid,
    body: web::Json<LikeInput>,
) -> XrpcResult<HttpResponse> {
    let uri = required_uri(&body)?;
    let db = state.db();
    let user_id = caller_id(db, &auth.did).await?;

    let shout_id = shout_id_for(db, &uri)
        .await?
        .ok_or_else(|| XrpcError::invalid_request("No shout at that URI").named("ShoutNotFound"))?;

    if existing_shout_like(db, &user_id, &shout_id)
        .await?
        .is_some()
    {
        return ok_empty();
    }

    let subject = strong_ref(&state, &uri).await?;
    let writer = Writer::for_did(&state, &auth.did).await?;
    let rkey = crate::atproto::records::next_tid();
    let written = writer
        .create(LIKE_COLLECTION, &rkey, &LikeRecord::new(subject))
        .await?;

    let insert = Query::insert()
        .into_table(ShoutLikes::Table)
        .columns([
            ShoutLikes::XataId,
            ShoutLikes::UserId,
            ShoutLikes::ShoutId,
            ShoutLikes::Uri,
        ])
        .values_panic([
            new_id().into(),
            user_id.clone().into(),
            shout_id.clone().into(),
            written.uri.clone().into(),
        ])
        .to_owned();
    db.execute(&insert).await?;

    ok_empty()
}

/// `app.rocksky.like.dislikeShout`
async fn dislike_shout(
    state: web::Data<AppState>,
    auth: AuthDid,
    body: web::Json<LikeInput>,
) -> XrpcResult<HttpResponse> {
    let uri = required_uri(&body)?;
    let db = state.db();
    let user_id = caller_id(db, &auth.did).await?;

    let Some(shout_id) = shout_id_for(db, &uri).await? else {
        return ok_empty();
    };
    let Some(like_uri) = existing_shout_like(db, &user_id, &shout_id).await? else {
        return ok_empty();
    };

    if let Some(rkey) = rkey_of(&like_uri) {
        let writer = Writer::for_did(&state, &auth.did).await?;
        writer.delete(LIKE_COLLECTION, &rkey).await?;
    }

    let delete = Query::delete()
        .from_table(ShoutLikes::Table)
        .and_where(Expr::col(ShoutLikes::UserId).eq(&user_id))
        .and_where(Expr::col(ShoutLikes::ShoutId).eq(&shout_id))
        .to_owned();
    db.execute(&delete).await?;

    ok_empty()
}

// ------------------------------------------------------------------- shared

fn required_uri(body: &LikeInput) -> Result<String, XrpcError> {
    body.uri
        .as_deref()
        .map(str::trim)
        .filter(|uri| !uri.is_empty())
        .map(str::to_string)
        .ok_or_else(|| XrpcError::invalid_request("uri is required"))
}

/// The rkey at the end of an AT-URI.
///
/// A like's own URI is `at://<did>/app.rocksky.like/<rkey>`, and deleting the
/// record needs that last segment. Returns `None` for a URI that is not
/// shaped that way rather than deleting something arbitrary.
pub fn rkey_of(uri: &str) -> Option<String> {
    let rkey = uri.rsplit('/').next()?;
    (!rkey.is_empty() && rkey != uri).then(|| rkey.to_string())
}

async fn caller_id(db: &Backend, did: &str) -> Result<String, XrpcError> {
    let query = Query::select()
        .column(Users::XataId)
        .from(Users::Table)
        .and_where(Expr::col(Users::Did).eq(did))
        .limit(1)
        .take();

    db.fetch_scalar::<String>(&query)
        .await?
        .ok_or_else(|| XrpcError::auth_required("Unauthorized"))
}

async fn find_track(db: &Backend, uri: &str) -> Result<Option<Track>, sqlx::Error> {
    let mut query = Query::select();
    db.select_model(&mut query, TRACK_COLS, None);
    query
        .from(Tracks::Table)
        .and_where(Expr::col(Tracks::Uri).eq(uri))
        .limit(1);

    db.fetch_optional::<Track>(&query).await
}

/// The like's own AT-URI, if this user has already liked this track.
async fn existing_like(
    db: &Backend,
    user_id: &str,
    track_id: &str,
) -> Result<Option<String>, sqlx::Error> {
    let query = Query::select()
        .column(LovedTracks::Uri)
        .from(LovedTracks::Table)
        .and_where(Expr::col(LovedTracks::UserId).eq(user_id))
        .and_where(Expr::col(LovedTracks::TrackId).eq(track_id))
        .limit(1)
        .take();

    db.fetch_scalar::<String>(&query).await
}

async fn existing_shout_like(
    db: &Backend,
    user_id: &str,
    shout_id: &str,
) -> Result<Option<String>, sqlx::Error> {
    let query = Query::select()
        .column(ShoutLikes::Uri)
        .from(ShoutLikes::Table)
        .and_where(Expr::col(ShoutLikes::UserId).eq(user_id))
        .and_where(Expr::col(ShoutLikes::ShoutId).eq(shout_id))
        .limit(1)
        .take();

    db.fetch_scalar::<String>(&query).await
}

async fn shout_id_for(db: &Backend, uri: &str) -> Result<Option<String>, sqlx::Error> {
    let query = Query::select()
        .column(Shouts::XataId)
        .from(Shouts::Table)
        .and_where(Expr::col(Shouts::Uri).eq(uri))
        .limit(1)
        .take();

    db.fetch_scalar::<String>(&query).await
}

/// Fetches the subject's current CID, to pin the like to a version.
///
/// Read from the subject's *own* repository rather than this instance's
/// database, because the appview stores no CIDs — and because the CID has to
/// be the one the subject's PDS would report, not one this instance computed.
async fn strong_ref(state: &AppState, uri: &str) -> Result<StrongRef, XrpcError> {
    let (did, collection, rkey) = split_at_uri(uri)
        .ok_or_else(|| XrpcError::invalid_request(format!("{uri} is not an at:// record URI")))?;

    let pds = crate::atproto::resolve_pds(state.http(), &state.config().plc_directory_url, &did)
        .await
        .map_err(|err| {
            tracing::warn!(did, error = %err, "could not resolve the subject's PDS");
            XrpcError::with_message(
                crate::error::ResponseType::UpstreamFailure,
                "Could not reach the PDS holding that record",
            )
        })?;

    let url = format!(
        "{pds}/xrpc/com.atproto.repo.getRecord?repo={did}&collection={collection}&rkey={rkey}"
    );
    let response = state.http().get(&url).send().await.map_err(|err| {
        tracing::warn!(error = %err, "could not read the subject record");
        XrpcError::with_message(
            crate::error::ResponseType::UpstreamFailure,
            "Could not read that record from its PDS",
        )
    })?;

    if !response.status().is_success() {
        return Err(XrpcError::invalid_request(
            "That record no longer exists in its repository",
        ));
    }

    let body: serde_json::Value = response.json().await.map_err(|err| {
        XrpcError::with_message(
            crate::error::ResponseType::UpstreamFailure,
            format!("The PDS answered something unreadable: {err}"),
        )
    })?;

    let cid = body
        .get("cid")
        .and_then(|value| value.as_str())
        .ok_or_else(|| {
            // Without a CID there is no strong ref, and a like with a
            // fabricated one would not validate anywhere.
            XrpcError::with_message(
                crate::error::ResponseType::UpstreamFailure,
                "The PDS did not report the record's CID",
            )
        })?;

    Ok(StrongRef {
        uri: uri.to_string(),
        cid: cid.to_string(),
    })
}

/// Splits `at://<did>/<collection>/<rkey>`.
pub fn split_at_uri(uri: &str) -> Option<(String, String, String)> {
    let rest = uri.strip_prefix("at://")?;
    let mut parts = rest.splitn(3, '/');
    let did = parts.next()?;
    let collection = parts.next()?;
    let rkey = parts.next()?;

    (!did.is_empty() && !collection.is_empty() && !rkey.is_empty())
        .then(|| (did.to_string(), collection.to_string(), rkey.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_at_uri_splits_into_its_three_parts() {
        assert_eq!(
            split_at_uri("at://did:plc:alice/app.rocksky.song/3k2a"),
            Some((
                "did:plc:alice".to_string(),
                "app.rocksky.song".to_string(),
                "3k2a".to_string()
            ))
        );
    }

    /// Anything not shaped like a record URI must be refused rather than
    /// half-parsed — a `getRecord` built from the wrong pieces would read some
    /// other record.
    #[test]
    fn a_malformed_uri_does_not_parse() {
        for uri in [
            "https://example.com/a/b",
            "at://",
            "at://did:plc:alice",
            "at://did:plc:alice/app.rocksky.song",
            "at:///app.rocksky.song/3k2a",
            "at://did:plc:alice//3k2a",
            "",
        ] {
            assert_eq!(split_at_uri(uri), None, "{uri:?} should not parse");
        }
    }

    #[test]
    fn the_rkey_is_the_last_segment() {
        assert_eq!(
            rkey_of("at://did:plc:alice/app.rocksky.like/3k2a").as_deref(),
            Some("3k2a")
        );
        // A bare word is not a URI, so there is no rkey to delete.
        assert_eq!(rkey_of("3k2a"), None);
        assert_eq!(rkey_of(""), None);
    }

    #[test]
    fn a_missing_uri_is_a_bad_request() {
        let error = required_uri(&LikeInput { uri: None }).unwrap_err();
        assert_eq!(error.kind.status(), 400);

        // Blank and whitespace-only are the same as absent.
        assert!(required_uri(&LikeInput {
            uri: Some("".into())
        })
        .is_err());
        assert!(required_uri(&LikeInput {
            uri: Some("   ".into())
        })
        .is_err());

        // And a real URI comes back trimmed.
        assert_eq!(
            required_uri(&LikeInput {
                uri: Some("  at://did:plc:alice/app.rocksky.song/3k2a  ".into())
            })
            .unwrap(),
            "at://did:plc:alice/app.rocksky.song/3k2a"
        );
    }

    /// The record must serialize as the lexicon declares: `$type`, a strong
    /// ref, and a camelCase `createdAt`.
    #[test]
    fn a_like_record_serializes_as_the_lexicon_declares() {
        let record = LikeRecord::new(StrongRef {
            uri: "at://did:plc:alice/app.rocksky.song/3k2a".into(),
            cid: "bafyreiabc".into(),
        });
        let value = serde_json::to_value(&record).unwrap();

        assert_eq!(value["$type"], "app.rocksky.like");
        assert_eq!(
            value["subject"]["uri"],
            "at://did:plc:alice/app.rocksky.song/3k2a"
        );
        assert_eq!(value["subject"]["cid"], "bafyreiabc");
        assert!(
            value.get("createdAt").is_some(),
            "createdAt must be camelCase: {value}"
        );
        // And it is a JavaScript-shaped timestamp, three fractional digits.
        let created = value["createdAt"].as_str().unwrap();
        assert!(created.ends_with('Z'), "{created}");
        assert_eq!(created.len(), 24, "{created}");
    }
}
