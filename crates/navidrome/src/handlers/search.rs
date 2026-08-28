use actix_web::HttpResponse;
use serde_json::{json, Value};
use sqlx::{Pool, Postgres};
use std::{collections::HashMap, sync::Arc};

use crate::{handlers::songs::track_to_json, repo, response, typesense::TypesenseClient};

pub async fn handle_search3(
    format: &str,
    user_id: &str,
    pool: &Arc<Pool<Postgres>>,
    params: &HashMap<String, String>,
    ts: Option<&TypesenseClient>,
) -> HttpResponse {
    // Empty query is valid — clients use it to list all tracks/albums/artists
    let query = params.get("query").map(|s| s.as_str()).unwrap_or("");

    let artist_count: i64 = params
        .get("artistCount")
        .and_then(|s| s.parse().ok())
        .unwrap_or(20);
    let artist_offset: i64 = params
        .get("artistOffset")
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    let album_count: i64 = params
        .get("albumCount")
        .and_then(|s| s.parse().ok())
        .unwrap_or(20);
    let album_offset: i64 = params
        .get("albumOffset")
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    let song_count: i64 = params
        .get("songCount")
        .and_then(|s| s.parse().ok())
        .unwrap_or(20);
    let song_offset: i64 = params
        .get("songOffset")
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);

    // An at:// query is a record lookup, not a text search — NFC tags and share
    // links carry a record URI, and neither Typesense nor a LIKE over titles
    // would ever match one.
    if query.starts_with("at://") {
        return resolve_record_uri(format, user_id, pool, query.trim()).await;
    }

    // Empty query is the "browse all" path used by the web client's infinite-scroll
    // tabs. Typesense's pagination here is hard-capped at 250 hits on page=1, so we
    // skip it for browse-all and let SQL do real LIMIT/OFFSET pagination.
    if !query.trim().is_empty() {
        if let Some(ts) = ts {
            return search_via_typesense(
                format,
                user_id,
                pool,
                ts,
                query,
                artist_count,
                artist_offset,
                album_count,
                album_offset,
                song_count,
                song_offset,
            )
            .await;
        }
    }

    // Fallback / browse-all: PostgreSQL LIKE search
    let artists_fut =
        repo::artist::search_artists(pool, user_id, query, artist_count, artist_offset);
    let albums_fut = repo::album::search_albums(pool, user_id, query, album_count, album_offset);
    let songs_fut = repo::track::search_tracks(pool, user_id, query, song_count, song_offset);

    let (artists, albums, songs) = tokio::join!(artists_fut, albums_fut, songs_fut);
    build_response(format, user_id, artists.ok(), albums.ok(), songs.ok(), None)
}

/// Resolves one record URI to the library entity it names.
///
/// The collection segment says what the URI is, so it picks the lookup outright
/// — running a playlist URI through the album lookup would just report "not
/// found" for something that is in the library. A URI naming anything else (a
/// foreign lexicon, a profile) matches nothing, which is the honest answer
/// rather than an error.
///
/// Metadata only, like every other search3 result: the client follows up with
/// getAlbum / getPlaylist — both of which take a URI too — for the contents.
async fn resolve_record_uri(
    format: &str,
    user_id: &str,
    pool: &Arc<Pool<Postgres>>,
    uri: &str,
) -> HttpResponse {
    if uri.contains("/app.rocksky.playlist/") {
        return match repo::playlist::get_playlist_by_uri(pool, uri, user_id).await {
            Ok(found) => build_response(
                format,
                user_id,
                None,
                None,
                None,
                found.map(|(p, _)| vec![p]),
            ),
            Err(e) => {
                tracing::error!("search3 playlist by uri error: {}", e);
                response::err(format, 0, "Internal server error")
            }
        };
    }

    if uri.contains("/app.rocksky.album/") {
        return match repo::album::get_album_by_uri(pool, uri, user_id).await {
            Ok(found) => build_response(format, user_id, None, found.map(|a| vec![a]), None, None),
            Err(e) => {
                tracing::error!("search3 album by uri error: {}", e);
                response::err(format, 0, "Internal server error")
            }
        };
    }

    build_response(format, user_id, None, None, None, None)
}

async fn search_via_typesense(
    format: &str,
    user_id: &str,
    pool: &Arc<Pool<Postgres>>,
    ts: &TypesenseClient,
    query: &str,
    artist_count: i64,
    artist_offset: i64,
    album_count: i64,
    album_offset: i64,
    song_count: i64,
    song_offset: i64,
) -> HttpResponse {
    let (track_ids_res, album_pairs_res, artist_names_res) = tokio::join!(
        ts.search_track_ids(user_id, query, song_count, song_offset),
        ts.search_album_names(user_id, query, album_count, album_offset),
        ts.search_artist_names(user_id, query, artist_count, artist_offset),
    );

    let track_ids = track_ids_res.unwrap_or_default();
    let album_pairs = album_pairs_res.unwrap_or_default();
    let artist_names = artist_names_res.unwrap_or_default();

    let (tracks, albums, artists) = tokio::join!(
        repo::track::get_tracks_by_ids(pool, &track_ids, user_id),
        repo::album::get_albums_by_names(pool, user_id, &album_pairs),
        repo::artist::get_artists_by_names(pool, user_id, &artist_names),
    );

    build_response(
        format,
        user_id,
        artists.ok(),
        albums.ok(),
        tracks.ok(),
        None,
    )
}

fn build_response(
    format: &str,
    user_id: &str,
    artists: Option<Vec<crate::xata::artist::ArtistWithStats>>,
    albums: Option<Vec<crate::xata::album::AlbumWithStats>>,
    songs: Option<Vec<crate::xata::track::TrackWithUpload>>,
    playlists: Option<Vec<crate::repo::playlist::PlaylistRow>>,
) -> HttpResponse {
    let artist_list: Vec<Value> = artists
        .unwrap_or_default()
        .iter()
        .map(|a| {
            let mut obj = json!({
                "id": a.xata_id,
                "name": a.name,
                "albumCount": a.album_count,
            });
            if let Some(pic) = &a.picture {
                obj["artistImageUrl"] = json!(pic);
                obj["coverArt"] = json!(format!("ar-{}", a.xata_id));
            }
            obj
        })
        .collect();

    let album_list: Vec<Value> = albums
        .unwrap_or_default()
        .iter()
        .map(|a| {
            let mut obj = json!({
                "id": a.xata_id,
                "name": a.title,
                "title": a.title,
                "artist": a.artist,
                "songCount": a.song_count,
                "duration": a.total_duration.unwrap_or(0) / 1000,
                "created": a.created_at.map(|d| d.to_rfc3339()).unwrap_or_default(),
            });
            if let Some(aid) = &a.artist_id {
                obj["artistId"] = json!(aid);
            }
            if let Some(year) = a.year {
                obj["year"] = json!(year);
            }
            if let Some(uri) = &a.uri {
                obj["uri"] = json!(uri);
            }
            if a.album_art.is_some() {
                obj["coverArt"] = json!(format!("al-{}", a.xata_id));
            }
            obj
        })
        .collect();

    let song_list: Vec<Value> = songs
        .unwrap_or_default()
        .iter()
        .map(|t| track_to_json(t, user_id))
        .collect();

    let playlist_list: Vec<Value> = playlists
        .unwrap_or_default()
        .iter()
        .map(super::playlists::playlist_to_json)
        .collect();

    let mut result = json!({
        "artist": artist_list,
        "album": album_list,
        "song": song_list,
    });
    // Subsonic's searchResult3 has no playlist field, so it only appears when a
    // record URI actually resolved to one. Clients that don't know it ignore it.
    if !playlist_list.is_empty() {
        result["playlist"] = json!(playlist_list);
    }

    response::ok(format, json!({ "searchResult3": result }))
}
