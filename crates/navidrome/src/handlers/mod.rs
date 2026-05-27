pub mod albums;
pub mod artists;
pub mod cover_art;
pub mod directory;
pub mod genres;
pub mod info;
pub mod music_folders;
pub mod ping;
pub mod playlists;
pub mod playqueue;
pub mod scrobble;
pub mod search;
pub mod songs;
pub mod star;
pub mod starred;
pub mod stream;
pub mod user;

use actix_web::{get, post, route, web, HttpRequest, HttpResponse};
use sqlx::{Pool, Postgres};
use std::{collections::HashMap, sync::Arc};

use crate::{auth, response, typesense::TypesenseClient};

fn get_format(params: &HashMap<String, String>) -> String {
    params
        .get("f")
        .map(|s| s.to_lowercase())
        .filter(|s| s == "xml" || s == "json")
        .unwrap_or_else(|| "json".to_string())
}

async fn dispatch(
    method: &str,
    params: HashMap<String, String>,
    pool: &Arc<Pool<Postgres>>,
    range: Option<String>,
    ts: Option<&TypesenseClient>,
    nc: &Arc<async_nats::Client>,
) -> HttpResponse {
    let format = get_format(&params);

    // Auth is required for all endpoints except ping
    let user = if method != "ping" {
        let username = match params.get("u") {
            Some(u) => u.as_str(),
            None => return response::err(&format, 10, "Missing u parameter"),
        };
        // Treat p="" the same as missing p — some clients send an empty p
        // alongside t+s token auth; filtering here lets token auth proceed.
        let password = params
            .get("p")
            .filter(|p| !p.is_empty())
            .map(|s| s.as_str());
        let token = params.get("t").map(|s| s.as_str());
        let salt = params.get("s").map(|s| s.as_str());

        if password.is_none() && (token.is_none() || salt.is_none()) {
            return response::err(&format, 10, "Missing credentials: provide p or t+s");
        }

        match auth::authenticate(pool, username, password, token, salt).await {
            Ok(u) => Some(u),
            Err(e) => {
                tracing::warn!("Auth failed for '{}': {}", username, e);
                return response::err(&format, 40, "Wrong username or password");
            }
        }
    } else {
        None
    };

    let user_id = user.as_ref().map(|u| u.xata_id.as_str()).unwrap_or("");

    match method {
        "ping" => ping::handle(&format),
        "getMusicFolders" => music_folders::handle(&format),
        "getArtists" => artists::handle_get_artists(&format, user_id, pool, false).await,
        "getIndexes" => artists::handle_get_artists(&format, user_id, pool, true).await,
        "getArtist" => {
            let id = match params.get("id") {
                Some(id) => id.as_str(),
                None => return response::err(&format, 10, "Missing id parameter"),
            };
            artists::handle_get_artist(&format, user_id, id, pool).await
        }
        "getAlbum" => {
            let id = match params.get("id") {
                Some(id) => id.as_str(),
                None => return response::err(&format, 10, "Missing id parameter"),
            };
            albums::handle_get_album(&format, user_id, id, pool).await
        }
        "getSong" => {
            let id = match params.get("id") {
                Some(id) => id.as_str(),
                None => return response::err(&format, 10, "Missing id parameter"),
            };
            songs::handle_get_song(&format, user_id, id, pool).await
        }
        "stream" => {
            let id = match params.get("id") {
                Some(id) => id.as_str(),
                None => return response::err(&format, 10, "Missing id parameter"),
            };
            stream::handle(&format, user_id, id, pool, range.as_deref(), nc, true).await
        }
        "download" => {
            let id = match params.get("id") {
                Some(id) => id.as_str(),
                None => return response::err(&format, 10, "Missing id parameter"),
            };
            stream::handle(&format, user_id, id, pool, range.as_deref(), nc, false).await
        }
        "getCoverArt" => {
            let id = match params.get("id") {
                Some(id) => id.as_str(),
                None => return response::err(&format, 10, "Missing id parameter"),
            };
            cover_art::handle(&format, id, pool).await
        }
        "search3" | "search2" => search::handle_search3(&format, user_id, pool, &params, ts).await,
        "scrobble" => scrobble::handle_scrobble(&format, user_id, pool, &params, nc).await,
        "updateNowPlaying" => {
            scrobble::handle_update_now_playing(&format, user_id, pool, &params, nc).await
        }
        "getAlbumList2" | "getAlbumList" => {
            albums::handle_get_album_list2(&format, user_id, pool, &params, method).await
        }
        "getRandomSongs" => songs::handle_get_random_songs(&format, user_id, pool, &params).await,
        "star" => star::handle_star(&format, user_id, pool, &params).await,
        "unstar" => star::handle_unstar(&format, user_id, pool, &params).await,
        "getUser" => {
            let u = user.as_ref().unwrap();
            user::handle_get_user(&format, u)
        }
        "getLicense" => user::handle_get_license(&format),
        "getScanStatus" | "startScan" => user::handle_get_scan_status(&format, pool),
        "getGenres" => genres::handle_get_genres(&format, user_id, pool).await,
        "getSongsByGenre" => {
            genres::handle_get_songs_by_genre(&format, user_id, pool, &params).await
        }
        "getStarred" | "getStarred2" => {
            starred::handle_get_starred2(&format, user_id, pool, method).await
        }
        "getArtistInfo" => {
            let id = match params.get("id") {
                Some(id) => id.as_str(),
                None => return response::err(&format, 10, "Missing id parameter"),
            };
            info::handle_get_artist_info(&format, user_id, id, pool, false).await
        }
        "getArtistInfo2" => {
            let id = match params.get("id") {
                Some(id) => id.as_str(),
                None => return response::err(&format, 10, "Missing id parameter"),
            };
            info::handle_get_artist_info(&format, user_id, id, pool, true).await
        }
        "getAlbumInfo" => {
            let id = match params.get("id") {
                Some(id) => id.as_str(),
                None => return response::err(&format, 10, "Missing id parameter"),
            };
            info::handle_get_album_info(&format, id, pool, false, &params).await
        }
        "getAlbumInfo2" => {
            let id = match params.get("id") {
                Some(id) => id.as_str(),
                None => return response::err(&format, 10, "Missing id parameter"),
            };
            info::handle_get_album_info(&format, id, pool, true, &params).await
        }
        "getNowPlaying" => info::handle_get_now_playing(&format, user_id, pool).await,
        "getMusicDirectory" => {
            let id = match params.get("id") {
                Some(id) => id.as_str(),
                None => return response::err(&format, 10, "Missing id parameter"),
            };
            directory::handle_get_music_directory(&format, user_id, id, pool).await
        }
        "getPlayQueue" => playqueue::handle_get_play_queue(&format, user_id, pool).await,
        "savePlayQueue" => playqueue::handle_save_play_queue(&format, user_id, pool, &params).await,
        "getPlaylists" => playlists::handle_get_playlists(&format, user_id, pool).await,
        "getPlaylist" => {
            let id = match params.get("id") {
                Some(id) => id.as_str(),
                None => return response::err(&format, 10, "Missing id parameter"),
            };
            playlists::handle_get_playlist(&format, user_id, id, pool).await
        }
        "getSimilarSongs" | "getSimilarSongs2" => response::ok(
            &format,
            serde_json::json!({ "similarSongs": { "song": [] } }),
        ),
        "getTopSongs" => response::ok(&format, serde_json::json!({ "topSongs": { "song": [] } })),
        "getLyrics" => response::ok(&format, serde_json::json!({ "lyrics": {} })),
        "getInternetRadioStations" => response::ok(
            &format,
            serde_json::json!({ "internetRadioStations": { "internetRadioStation": [] } }),
        ),
        _ => response::err(
            &format,
            70,
            &format!("Requested method '{}' not found", method),
        ),
    }
}

#[get("/rest/{method}")]
pub async fn handle_get(
    req: HttpRequest,
    path: web::Path<String>,
    pool: web::Data<Arc<Pool<Postgres>>>,
    ts_data: web::Data<Arc<Option<TypesenseClient>>>,
    nc_data: web::Data<Arc<async_nats::Client>>,
    query: web::Query<HashMap<String, String>>,
) -> HttpResponse {
    let method = path.into_inner();
    let method = method.trim_end_matches(".view").to_string();
    let range = req
        .headers()
        .get("Range")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let ts = ts_data.get_ref().as_ref().as_ref();
    dispatch(
        &method,
        query.into_inner(),
        pool.get_ref(),
        range,
        ts,
        nc_data.get_ref(),
    )
    .await
}

#[route("/rest/{method}", method = "HEAD")]
pub async fn handle_head(
    req: HttpRequest,
    path: web::Path<String>,
    pool: web::Data<Arc<Pool<Postgres>>>,
    nc_data: web::Data<Arc<async_nats::Client>>,
    query: web::Query<HashMap<String, String>>,
) -> HttpResponse {
    let method = path.into_inner();
    let method = method.trim_end_matches(".view").to_string();
    if method != "stream" && method != "download" {
        return HttpResponse::MethodNotAllowed().finish();
    }

    let params = query.into_inner();
    let format = get_format(&params);

    let username = match params.get("u") {
        Some(u) => u.as_str(),
        None => return response::err(&format, 10, "Missing u parameter"),
    };
    let password = params
        .get("p")
        .filter(|p| !p.is_empty())
        .map(|s| s.as_str());
    let token = params.get("t").map(|s| s.as_str());
    let salt = params.get("s").map(|s| s.as_str());

    if password.is_none() && (token.is_none() || salt.is_none()) {
        return response::err(&format, 10, "Missing credentials: provide p or t+s");
    }

    let user = match auth::authenticate(pool.get_ref(), username, password, token, salt).await {
        Ok(u) => u,
        Err(e) => {
            tracing::warn!("Auth failed for '{}': {}", username, e);
            return response::err(&format, 40, "Wrong username or password");
        }
    };

    let id = match params.get("id") {
        Some(id) => id.as_str(),
        None => return response::err(&format, 10, "Missing id parameter"),
    };

    let _ = req;
    let _ = nc_data;
    stream::handle_head(&format, &user.xata_id, id, pool.get_ref()).await
}

#[post("/rest/{method}")]
pub async fn handle_post(
    req: HttpRequest,
    path: web::Path<String>,
    pool: web::Data<Arc<Pool<Postgres>>>,
    ts_data: web::Data<Arc<Option<TypesenseClient>>>,
    nc_data: web::Data<Arc<async_nats::Client>>,
    query: web::Query<HashMap<String, String>>,
    body: web::Bytes,
) -> HttpResponse {
    let method = path.into_inner();
    let method = method.trim_end_matches(".view").to_string();
    let range = req
        .headers()
        .get("Range")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    // Seed from query string, then overlay form body (body takes precedence).
    // Classic Subsonic clients send params in the URL query string on POST
    // requests; OpenSubsonic / newer clients use the form body.
    let mut params = query.into_inner();
    if let Ok(body_str) = std::str::from_utf8(&body) {
        if let Ok(form_params) = serde_urlencoded::from_str::<HashMap<String, String>>(body_str) {
            params.extend(form_params);
        }
    }

    let ts = ts_data.get_ref().as_ref().as_ref();
    dispatch(
        &method,
        params,
        pool.get_ref(),
        range,
        ts,
        nc_data.get_ref(),
    )
    .await
}
