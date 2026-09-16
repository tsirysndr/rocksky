//! `app.rocksky.spotify.*` — what a listener has playing on Spotify.
//!
//! # Only `getCurrentlyPlaying` is registered
//!
//! The lexicon also declares `play`, `pause`, `next`, `previous` and `seek`.
//! Each of those has to reach the Spotify Web API as the listener, which means
//! decrypting their stored refresh token and their app's client secret,
//! exchanging the refresh token for an access token, and calling
//! `/me/player/*`. The first step is the one this process cannot take.
//!
//! `spotify_tokens.refresh_token` and `spotify_apps.spotify_secret` are
//! written by `apps/api`'s `lib/crypto.ts`, which is **AES-256-CTR with a
//! fixed IV**, hex encoded, keyed by `SPOTIFY_ENCRYPTION_KEY` — the same
//! format `crates/spotify/src/crypto.rs` reads. [`crate::crypto`] is a
//! different scheme entirely: XSalsa20-Poly1305 secretbox, base64url, with the
//! nonce prepended, keyed by `STORAGE_ENCRYPTION_KEY`. The two are not
//! interchangeable in algorithm, in encoding, or in key — and this instance's
//! storage key is generated per instance (`config::load_or_create_storage_key`),
//! so it could not be the Spotify key even if the format matched. Handing a
//! Spotify ciphertext to `decrypt_credential` fails its Poly1305 check.
//!
//! Registering those five with no way to decrypt a real token would make every
//! call answer a plausible-looking failure. They are left unregistered, so they
//! answer 404 and the gap is visible. Closing it needs the Spotify key and IV
//! in this crate's config, which is a deliberate decision rather than a
//! detail of this module.
//!
//! # `getCurrentlyPlaying` needs no token
//!
//! It does not call Spotify at all. `crates/spotify` polls the Web API and
//! publishes each listener's now-playing under `<spotify email>:current`; this
//! reads that, and decorates it with the catalogue's AT-URIs so the UI can
//! link to the song, album and artist pages.

use crate::auth::Auth;
use crate::db::schema::{LovedTracks, SpotifyAccounts, SpotifyTokens, Tracks};
use crate::db::Backend;
use crate::error::{XrpcError, XrpcResult};
use crate::sea_query::{Alias, Expr, JoinType, Query, SelectStatement};
use crate::state::AppState;
use crate::xrpc::{json, ok_empty};
use crate::xrpc_query;
use actix_web::web::{self, ServiceConfig};
use actix_web::HttpResponse;
use serde::{Deserialize, Serialize};

pub fn configure(cfg: &mut ServiceConfig) {
    xrpc_query!(
        cfg,
        "app.rocksky.spotify.getCurrentlyPlaying",
        get_currently_playing
    );
}

// --------------------------------------------------------------- the view

/// The cached now-playing object, and the reply.
///
/// One type for both: the cache holds Spotify's own JSON, so reading it and
/// answering it are the same shape plus four fields of ours. The Spotify field
/// names stay snake_case, because that is what clients written against the
/// TypeScript API — which spreads the raw object — already read.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct CurrentlyPlayingView {
    #[serde(default)]
    pub is_playing: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub progress_ms: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub currently_playing_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub item: Option<SpotifyItem>,
    #[serde(rename = "songUri", default, skip_serializing_if = "Option::is_none")]
    pub song_uri: Option<String>,
    #[serde(rename = "artistUri", default, skip_serializing_if = "Option::is_none")]
    pub artist_uri: Option<String>,
    #[serde(rename = "albumUri", default, skip_serializing_if = "Option::is_none")]
    pub album_uri: Option<String>,
    #[serde(default)]
    pub liked: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct SpotifyItem {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub preview_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub track_number: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub disc_number: Option<i64>,
    #[serde(default)]
    pub explicit: bool,
    #[serde(default)]
    pub artists: Vec<SpotifyArtistRef>,
    #[serde(default)]
    pub album: SpotifyAlbumRef,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct SpotifyArtistRef {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct SpotifyAlbumRef {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
    #[serde(default)]
    pub images: Vec<SpotifyImage>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct SpotifyImage {
    #[serde(default)]
    pub url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<i64>,
}

// ------------------------------------------------------------- the method

#[derive(Debug, Clone, Deserialize)]
pub struct GetCurrentlyPlayingParams {
    /// A DID or a handle. Absent means the caller.
    #[serde(default)]
    pub actor: Option<String>,
}

/// `app.rocksky.spotify.getCurrentlyPlaying`
async fn get_currently_playing(
    state: web::Data<AppState>,
    auth: Auth,
    params: web::Query<GetCurrentlyPlayingParams>,
) -> XrpcResult<HttpResponse> {
    let actor = params
        .actor
        .as_deref()
        .map(str::trim)
        .filter(|actor| !actor.is_empty())
        .map(str::to_owned)
        .or_else(|| auth.did().map(str::to_owned))
        .ok_or_else(|| XrpcError::invalid_request("actor is required when unauthenticated"))?;

    let db = state.db();
    let user = crate::actors::find_user(db, &actor)
        .await?
        .ok_or_else(|| XrpcError::invalid_request("No such account"))?;

    let connection = spotify_connection(db, &user.id).await?;

    let Some(mut view) = state
        .cache()
        .get_json::<CurrentlyPlayingView>(&format!("{}:current", connection.email))
        .await
    else {
        // Nothing playing. Not a failure, and not something to invent a track
        // for: the key expires seconds after playback stops.
        return ok_empty();
    };

    attach_catalogue(db, &mut view, &user.id).await?;
    json(view)
}

/// The Spotify account a listener's now-playing is published under.
#[derive(Debug, Clone, PartialEq, Eq)]
struct SpotifyConnection {
    email: String,
}

/// Resolves the connection, or reports that there is none.
///
/// A missing row answers the XRPC error envelope rather than an empty
/// now-playing: "this account is not connected to Spotify" and "this account
/// is connected and paused" are different answers, and a client that cannot
/// tell them apart shows a broken player instead of an invitation to connect.
async fn spotify_connection(db: &Backend, user_id: &str) -> Result<SpotifyConnection, XrpcError> {
    db.fetch_scalar::<String>(&spotify_connection_query(user_id))
        .await?
        .map(|email| SpotifyConnection { email })
        .ok_or_else(|| {
            XrpcError::invalid_request("That account has no Spotify connection")
                .named("SpotifyNotConnected")
        })
}

/// The one statement that touches `spotify_tokens`.
///
/// It selects the account's email and nothing else. The token columns are
/// never read, so there is no access token or refresh token anywhere in this
/// module to leak into a reply or a log line — see the module note on why they
/// could not be used anyway.
fn spotify_connection_query(user_id: &str) -> SelectStatement {
    let account = Alias::new("acc");
    let token = Alias::new("tok");

    Query::select()
        .column((account.clone(), SpotifyAccounts::Email))
        .from_as(SpotifyAccounts::Table, account.clone())
        .join_as(
            JoinType::InnerJoin,
            SpotifyTokens::Table,
            token.clone(),
            Expr::col((token, SpotifyTokens::UserId))
                .equals((account.clone(), SpotifyAccounts::UserId)),
        )
        .and_where(Expr::col((account, SpotifyAccounts::UserId)).eq(user_id))
        .limit(1)
        .take()
}

/// Adds the catalogue's AT-URIs and the loved flag to a now-playing track.
///
/// `liked` is the *actor's* loved state, not the viewer's, which is what the
/// TypeScript handler reports: it resolves one user from `actor || caller` and
/// checks `loved_tracks` for that one.
async fn attach_catalogue(
    db: &Backend,
    view: &mut CurrentlyPlayingView,
    user_id: &str,
) -> Result<(), sqlx::Error> {
    let Some(item) = &view.item else {
        return Ok(());
    };

    let query = Query::select()
        .columns([
            Tracks::XataId,
            Tracks::Uri,
            Tracks::ArtistUri,
            Tracks::AlbumUri,
        ])
        .from(Tracks::Table)
        .and_where(Expr::col(Tracks::Sha256).eq(track_sha256(item)))
        .limit(1)
        .take();

    type TrackRow = (String, Option<String>, Option<String>, Option<String>);
    let Some((track_id, uri, artist_uri, album_uri)) =
        db.fetch_optional::<TrackRow>(&query).await?
    else {
        return Ok(());
    };

    view.song_uri = uri;
    view.artist_uri = artist_uri;
    view.album_uri = album_uri;

    let loved = Query::select()
        .column(LovedTracks::XataId)
        .from(LovedTracks::Table)
        .and_where(Expr::col(LovedTracks::TrackId).eq(&track_id))
        .and_where(Expr::col(LovedTracks::UserId).eq(user_id))
        .limit(1)
        .take();
    view.liked = db.fetch_scalar::<String>(&loved).await?.is_some();

    Ok(())
}

/// The catalogue's identity for a track: `sha256` of
/// `"<title> - <artists> - <album>"`, lowercased, artists joined by `", "`.
///
/// Spelled out here because a Spotify track carries no Rocksky id; getting the
/// separator or the case wrong silently finds nothing and the now-playing card
/// loses its links.
fn track_sha256(item: &SpotifyItem) -> String {
    use sha2::{Digest, Sha256};

    let artists = item
        .artists
        .iter()
        .map(|artist| artist.name.as_str())
        .collect::<Vec<_>>()
        .join(", ");
    let identity = format!("{} - {artists} - {}", item.name, item.album.name).to_lowercase();

    hex::encode(Sha256::digest(identity.as_bytes()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use crate::sea_query::SqliteQueryBuilder;

    async fn fixture() -> Backend {
        let backend = db::connect_in_memory().await.unwrap();

        let statements = [
            "INSERT INTO users (xata_id, did, handle, avatar) VALUES \
             ('rec_alice', 'did:plc:alice', 'alice.test', 'a'), \
             ('rec_bob', 'did:plc:bob', 'bob.test', 'b')",
            // Alice has connected Spotify; Bob has not.
            "INSERT INTO spotify_accounts (xata_id, email, user_id) VALUES \
             ('rec_acc', 'alice@example.invalid', 'rec_alice')",
            "INSERT INTO spotify_tokens \
             (xata_id, access_token, refresh_token, user_id, spotify_app_id) VALUES \
             ('rec_tok', 'ciphertext-a', 'ciphertext-r', 'rec_alice', 'app-1')",
            "INSERT INTO tracks \
             (xata_id, title, artist, album_artist, album, duration, sha256, uri, \
              artist_uri, album_uri) VALUES \
             ('rec_track', 'Roygbiv', 'Boards of Canada', 'Boards of Canada', 'MHTRTC', \
              1, 'sha-track', 'at://did:plc:alice/app.rocksky.song/1', \
              'at://did:plc:alice/app.rocksky.artist/1', \
              'at://did:plc:alice/app.rocksky.album/1')",
        ];
        for text in statements {
            backend.execute(&backend.sql(text)).await.expect(text);
        }
        backend
    }

    #[tokio::test]
    async fn a_connected_account_resolves_to_the_email_its_playback_is_published_under() {
        let db = fixture().await;
        assert_eq!(
            spotify_connection(&db, "rec_alice").await.unwrap(),
            SpotifyConnection {
                email: "alice@example.invalid".into()
            }
        );
    }

    /// No stored tokens must answer the XRPC error envelope. A fabricated
    /// empty now-playing would be indistinguishable from "connected and
    /// paused".
    #[tokio::test]
    async fn a_caller_with_no_stored_tokens_gets_the_error_envelope() {
        let db = fixture().await;
        let error = spotify_connection(&db, "rec_bob").await.unwrap_err();

        assert_eq!(error.kind.status(), 400);

        let body = error.body();
        assert_eq!(body.error, "SpotifyNotConnected");
        assert!(!body.message.is_empty());

        // Two fields, as `@atproto/xrpc-server` defines the envelope — and
        // emphatically not `{}`.
        let value = serde_json::to_value(&body).unwrap();
        assert_eq!(value.as_object().unwrap().len(), 2, "{value}");
    }

    /// The tokens table is joined for existence only. Nothing in this module
    /// ever reads a token, so nothing can print one.
    #[test]
    fn no_token_column_is_ever_selected() {
        let sql = spotify_connection_query("rec_alice").to_string(SqliteQueryBuilder);

        assert!(sql.contains("spotify_tokens"), "{sql}");
        assert!(!sql.contains("refresh_token"), "{sql}");
        assert!(!sql.contains("access_token"), "{sql}");
    }

    /// Belt and braces on the reply: a token must not reach a client even if
    /// one were ever put on the view.
    #[test]
    fn the_reply_carries_no_token() {
        let view = CurrentlyPlayingView {
            is_playing: true,
            progress_ms: Some(1234),
            item: Some(SpotifyItem {
                id: "spotify-id".into(),
                name: "Roygbiv".into(),
                ..Default::default()
            }),
            song_uri: Some("at://did:plc:alice/app.rocksky.song/1".into()),
            liked: true,
            ..Default::default()
        };

        let rendered = serde_json::to_string(&view).unwrap();
        assert!(!rendered.to_lowercase().contains("token"), "{rendered}");
    }

    /// The cached object is Spotify's own JSON; the reply keeps those names so
    /// a client reading the TypeScript API's passthrough still finds them.
    #[test]
    fn the_cached_spotify_object_round_trips() {
        let cached = serde_json::json!({
            "is_playing": true,
            "progress_ms": 42_000,
            "timestamp": 1_700_000_000_000i64,
            "currently_playing_type": "track",
            "item": {
                "id": "4uLU6hMCjMI75M1A2tKUQC",
                "name": "Roygbiv",
                "uri": "spotify:track:4uLU6hMCjMI75M1A2tKUQC",
                "duration_ms": 151_000,
                "artists": [{ "id": "a1", "name": "Boards of Canada" }],
                "album": {
                    "id": "al1",
                    "name": "MHTRTC",
                    "images": [{ "url": "https://example.invalid/a.jpg", "height": 640, "width": 640 }]
                }
            }
        });

        let view: CurrentlyPlayingView = serde_json::from_value(cached).unwrap();
        assert!(view.is_playing);
        assert_eq!(view.progress_ms, Some(42_000));
        let item = view.item.as_ref().unwrap();
        assert_eq!(item.name, "Roygbiv");
        assert_eq!(item.duration_ms, Some(151_000));
        assert_eq!(item.artists[0].name, "Boards of Canada");
        assert_eq!(item.album.images[0].url, "https://example.invalid/a.jpg");

        let rendered = serde_json::to_value(&view).unwrap();
        assert_eq!(rendered["is_playing"], true);
        assert_eq!(rendered["item"]["duration_ms"], 151_000);
        // Ours are camelCase, Spotify's are not; both appear as they do in
        // production.
        assert!(rendered.get("songUri").is_none(), "{rendered}");
        assert_eq!(rendered["liked"], false);
    }

    /// A Spotify track carries no Rocksky id, so the catalogue is found by the
    /// hash of its name, artists and album. Several artists join with `", "`.
    #[test]
    fn the_track_identity_is_the_lowercased_title_artists_album() {
        use sha2::{Digest, Sha256};

        let item = SpotifyItem {
            name: "Roygbiv".into(),
            artists: vec![
                SpotifyArtistRef {
                    name: "Boards Of Canada".into(),
                    ..Default::default()
                },
                SpotifyArtistRef {
                    name: "Someone Else".into(),
                    ..Default::default()
                },
            ],
            album: SpotifyAlbumRef {
                name: "MHTRTC".into(),
                ..Default::default()
            },
            ..Default::default()
        };

        let expected = hex::encode(Sha256::digest(
            "roygbiv - boards of canada, someone else - mhtrtc".as_bytes(),
        ));
        assert_eq!(track_sha256(&item), expected);
    }

    #[tokio::test]
    async fn a_known_track_gets_its_uris_and_loved_flag() {
        let db = fixture().await;

        // Make the fixture track findable by the hash the handler computes.
        let item = SpotifyItem {
            name: "Roygbiv".into(),
            artists: vec![SpotifyArtistRef {
                name: "Boards of Canada".into(),
                ..Default::default()
            }],
            album: SpotifyAlbumRef {
                name: "MHTRTC".into(),
                ..Default::default()
            },
            ..Default::default()
        };
        let mut update = db.sql("UPDATE tracks SET sha256 = ");
        update
            .bind(track_sha256(&item))
            .push(" WHERE xata_id = 'rec_track'");
        db.execute(&update).await.unwrap();

        let mut view = CurrentlyPlayingView {
            is_playing: true,
            item: Some(item),
            ..Default::default()
        };

        attach_catalogue(&db, &mut view, "rec_alice").await.unwrap();
        assert_eq!(
            view.song_uri.as_deref(),
            Some("at://did:plc:alice/app.rocksky.song/1")
        );
        assert_eq!(
            view.artist_uri.as_deref(),
            Some("at://did:plc:alice/app.rocksky.artist/1")
        );
        assert!(!view.liked);

        db.execute(&db.sql(
            "INSERT INTO loved_tracks (xata_id, user_id, track_id) VALUES \
             ('rec_loved', 'rec_alice', 'rec_track')",
        ))
        .await
        .unwrap();

        attach_catalogue(&db, &mut view, "rec_alice").await.unwrap();
        assert!(view.liked);
    }

    /// A track this instance has never seen keeps the reply, without links.
    #[tokio::test]
    async fn an_unknown_track_leaves_the_uris_absent() {
        let db = fixture().await;
        let mut view = CurrentlyPlayingView {
            is_playing: true,
            item: Some(SpotifyItem {
                name: "Nothing Here".into(),
                ..Default::default()
            }),
            ..Default::default()
        };

        attach_catalogue(&db, &mut view, "rec_alice").await.unwrap();
        assert!(view.song_uri.is_none());
        assert!(!view.liked);
    }
}
