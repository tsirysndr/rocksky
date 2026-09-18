//! `POST /likes` and `DELETE /likes/{sha256}` — starring a song from a client
//! that has never heard of AT-URIs.
//!
//! The lexicon procedures `app.rocksky.like.likeSong` and `dislikeSong` are
//! addressed by the song record's URI, which is the right key for the web UI:
//! it is looking at a record. A Subsonic or Jellyfin client is not. It knows a
//! title, an artist and an album, and `crates/navidrome` turns that into these
//! two requests — the same pair `apps/api` serves.
//!
//! So this is an adapter and not a second implementation: it resolves the
//! payload to a track row and hands it to [`crate::xrpc::app_rocksky::like`],
//! which writes the record, the row and the event exactly as it does for the
//! web UI.
//!
//! # A star can create the song
//!
//! `POST /likes` upserts the catalogue before liking, because the song being
//! starred may not be in the database at all — a track in your own library
//! that you have never played. `apps/api` does the same. The consequence is
//! that a like can be the *first* thing that creates a track row, and that row
//! has no `uri` because nobody has published a song record for it; the like is
//! then recorded locally and not in the repository. See
//! [`crate::xrpc::app_rocksky::like::like_track`].
//!
//! # `GET /likes` is not here
//!
//! `apps/api` serves it, and nothing calls it: the web UI and the mobile app
//! both read loved tracks through `app.rocksky.*`, and navidrome only ever
//! writes. A third implementation of the same list, for no caller, is not
//! worth carrying.

use crate::auth::AuthDid;
use crate::error::{XrpcError, XrpcResult};
use crate::state::AppState;
use crate::xrpc::app_rocksky::like::{like_track, track_by_sha256, unlike_track};
use crate::xrpc::app_rocksky::scrobble_write::{song_from_input, CreateScrobbleInput};
use actix_web::web::{self, ServiceConfig};
use actix_web::HttpResponse;

pub fn configure(cfg: &mut ServiceConfig) {
    cfg.route("/likes", web::post().to(create));
    cfg.route("/likes/{sha256}", web::delete().to(remove));
}

/// `POST /likes`
async fn create(
    state: web::Data<AppState>,
    auth: AuthDid,
    body: web::Json<CreateScrobbleInput>,
) -> XrpcResult<HttpResponse> {
    let input = body.into_inner();

    // `apps/api` validates this route with the same `trackSchema` as the
    // scrobble route, where all four are required — a like on a song with no
    // album cannot be hashed to the same row a scrobble of it produced.
    let title = required(&input.title, "title")?;
    let artist = required(&input.artist, "artist")?;
    let album = required(&input.album, "album")?;
    let album_artist = required(&input.album_artist, "albumArtist")?;

    let song = song_from_input(
        &input,
        &title,
        &artist,
        &album,
        &album_artist,
        chrono::Utc::now(),
    );

    let db = state.db();
    let track_id = crate::ingest::upsert_catalogue(db, &song)
        .await
        .map_err(|err| XrpcError::internal(anyhow::anyhow!(err)))?;

    // By id rather than by hash: `upsert_catalogue` has just told us which row
    // it wrote, and the same hash can name more than one row — the same
    // recording on a single and on a compilation — so looking it back up by
    // hash could attach the like to a different edition than the one the
    // caller described.
    let tracks = crate::db::loaders::tracks_by_id(db, [Some(track_id.clone())]).await?;
    let track = tracks
        .get(&track_id)
        .ok_or_else(|| XrpcError::internal(anyhow::anyhow!("track {track_id} vanished")))?;

    like_track(&state, &auth.did, track).await?;
    ok()
}

/// `DELETE /likes/{sha256}`
async fn remove(
    state: web::Data<AppState>,
    auth: AuthDid,
    path: web::Path<String>,
) -> XrpcResult<HttpResponse> {
    let sha256 = path.into_inner();

    // A hash this instance does not know is not an error: the caller wanted
    // the song unstarred, and it is. `apps/api` answers the same.
    let Some(track) = track_by_sha256(state.db(), &sha256).await? else {
        tracing::debug!(did = %auth.did, sha256 = %sha256, "nothing to unlike");
        return ok();
    };

    unlike_track(&state, &auth.did, &track).await?;
    ok()
}

/// What `apps/api` answers on both routes.
fn ok() -> XrpcResult<HttpResponse> {
    Ok(HttpResponse::Ok().json(serde_json::json!({ "status": "ok" })))
}

fn required(value: &Option<String>, field: &str) -> Result<String, XrpcError> {
    value
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .ok_or_else(|| XrpcError::invalid_request(format!("{field} is required")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use actix_web::test as http;

    macro_rules! app {
        ($state:expr) => {
            http::init_service(
                actix_web::App::new()
                    .app_data(actix_web::web::Data::new($state.clone()))
                    .configure(configure),
            )
            .await
        };
    }

    #[test]
    fn every_field_the_hash_needs_is_required() {
        assert!(required(&None, "title").is_err());
        assert!(required(&Some("   ".into()), "album").is_err());
        assert_eq!(
            required(&Some(" Roygbiv ".into()), "title").unwrap(),
            "Roygbiv"
        );
    }

    /// Both routes exist. Before this module they answered 404, and a star in
    /// a Subsonic client silently did nothing.
    #[actix_web::test]
    async fn the_routes_are_served() {
        let state = AppState::for_test().await.unwrap();
        let app = app!(state);

        for req in [
            http::TestRequest::post()
                .uri("/likes")
                .set_json(serde_json::json!({})),
            http::TestRequest::delete().uri("/likes/deadbeef"),
        ] {
            let res = http::call_service(&app, req.to_request()).await;
            assert_ne!(res.status(), 404, "the route is not registered");
        }
    }

    /// Without a token, neither route touches the database.
    #[actix_web::test]
    async fn both_routes_need_a_caller() {
        let state = AppState::for_test().await.unwrap();
        let app = app!(state);

        for req in [
            http::TestRequest::post().uri("/likes").set_json(
                serde_json::json!({"title":"Roygbiv","artist":"Boards of Canada","album":"Music Has the Right to Children","albumArtist":"Boards of Canada","duration":151000}),
            ),
            http::TestRequest::delete().uri("/likes/deadbeef"),
        ] {
            let res = http::call_service(&app, req.to_request()).await;
            assert_eq!(res.status(), 401);
        }
    }
}
