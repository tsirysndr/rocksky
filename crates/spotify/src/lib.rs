use std::{
    collections::HashMap,
    env,
    sync::{Arc, Mutex},
    time::Duration,
};

use anyhow::Error;
use async_nats::connect;
use reqwest::Client;
use sqlx::{postgres::PgPoolOptions, Pool, Postgres};
use tokio_stream::StreamExt;
use tokio_util::sync::CancellationToken;

use crate::{
    cache::Cache,
    crypto::decrypt_aes_256_ctr,
    rocksky::{scrobble, update_library},
    types::{
        album_tracks::AlbumTracks,
        currently_playing::{Album, Artist, CurrentlyPlaying},
        spotify_token::SpotifyTokenWithEmail,
        token::AccessToken,
    },
};

pub mod cache;
pub mod crypto;
pub mod rocksky;
pub mod token;
pub mod types;

pub const BASE_URL: &str = "https://api.spotify.com/v1";

pub async fn run() -> Result<(), Error> {
    let cache = Cache::new().await?;
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&env::var("XATA_POSTGRES_URL")?)
        .await?;

    let addr = env::var("NATS_URL").unwrap_or_else(|_| "nats://localhost:4222".to_string());
    let nc = connect(&addr).await?;
    tracing::info!(addr = %addr, "connected to NATS server");

    let mut sub = nc.subscribe("rocksky.spotify.user".to_string()).await?;
    tracing::info!(subject = "rocksky.spotify.user", "subscribed");

    let users = find_spotify_users(&pool, 0, 500).await?;
    tracing::info!(count = users.len(), "found spotify users");

    // Shared HashMap to manage per-user cancellation tokens
    let task_map: Arc<Mutex<HashMap<String, CancellationToken>>> =
        Arc::new(Mutex::new(HashMap::new()));

    // Helper function to start a user task with auto-recovery
    let start_user_task = |email: String,
                           token: String,
                           did: String,
                           client_id: String,
                           client_secret: String,
                           cancel: CancellationToken,
                           cache: Cache,
                           nc: async_nats::Client,
                           pool: Pool<Postgres>| {
        tokio::spawn(async move {
            let mut retry_count = 0u32;
            let max_retries = 5u32;

            loop {
                if cancel.is_cancelled() {
                    tracing::info!(email = %email, "cancel signal set, exiting recovery loop");
                    break;
                }

                match watch_currently_playing(
                    email.clone(),
                    token.clone(),
                    did.clone(),
                    cancel.clone(),
                    cache.clone(),
                    client_id.clone(),
                    client_secret.clone(),
                    nc.clone(),
                    pool.clone(),
                )
                .await
                {
                    Ok(_) => {
                        tracing::info!(email = %email, "task completed normally");
                        break;
                    }
                    Err(e) => {
                        retry_count += 1;
                        tracing::warn!(
                            email = %email,
                            attempt = retry_count,
                            max_retries,
                            error = %e,
                            "task crashed"
                        );

                        if retry_count >= max_retries {
                            tracing::warn!(
                                email = %email,
                                "max retries reached, publishing to NATS for external restart"
                            );
                            match nc
                                .publish("rocksky.spotify.user", email.clone().into())
                                .await
                            {
                                Ok(_) => {
                                    tracing::info!(
                                        email = %email,
                                        "published message to restart task"
                                    );
                                }
                                Err(e) => {
                                    tracing::error!(
                                        email = %email,
                                        error = %e,
                                        "error publishing message to restart task"
                                    );
                                }
                            }
                            break;
                        }

                        // Exponential backoff: 2^retry_count seconds, max 60 seconds
                        let backoff_seconds = std::cmp::min(2_u64.pow(retry_count), 60);
                        tracing::info!(
                            email = %email,
                            backoff_seconds,
                            "retrying"
                        );
                        tokio::time::sleep(Duration::from_secs(backoff_seconds)).await;
                    }
                }
            }
        })
    };

    // Start tasks for all users
    for user in users {
        let email = user.0.clone();
        let token = user.1.clone();
        let did = user.2.clone();
        let client_id = user.3.clone();
        let client_secret = user.4.clone();
        let cancel = CancellationToken::new();
        let cache = cache.clone();
        let nc = nc.clone();
        let task_map = Arc::clone(&task_map);
        let pool = pool.clone();

        task_map
            .lock()
            .unwrap()
            .insert(email.clone(), cancel.clone());

        start_user_task(
            email,
            token,
            did,
            client_id,
            client_secret,
            cancel,
            cache,
            nc,
            pool,
        );
    }

    // Handle subscription messages
    while let Some(message) = sub.next().await {
        let user_id = String::from_utf8(message.payload.to_vec()).unwrap();
        tracing::info!(user_id = %user_id, "received message to restart task");

        // Check if the user exists in the task map
        let existed = {
            let mut task_map = task_map.lock().unwrap();
            if let Some(cancel) = task_map.get(&user_id) {
                // Stop the existing task
                cancel.cancel();

                // Create a new token and insert it for the restarted task
                let new_cancel = CancellationToken::new();
                task_map.insert(user_id.clone(), new_cancel.clone());
                Some(new_cancel)
            } else {
                None
            }
        };

        if let Some(new_cancel) = existed {
            let user = find_spotify_user(&pool, &user_id).await?;

            if user.is_none() {
                tracing::warn!(user_id = %user_id, "spotify user not found, skipping");
                continue;
            }

            let user = user.unwrap();

            let email = user.0.clone();
            let token = user.1.clone();
            let did = user.2.clone();
            let client_id = user.3.clone();
            let client_secret = user.4.clone();
            let cache = cache.clone();
            let nc = nc.clone();
            let pool_clone = pool.clone();

            start_user_task(
                email,
                token,
                did,
                client_id,
                client_secret,
                new_cancel,
                cache,
                nc,
                pool_clone,
            );

            tracing::info!(user_id = %user_id, "restarted task for user");
        } else {
            tracing::info!(user_id = %user_id, "no task found for user, starting new task");
            let user = find_spotify_user(&pool, &user_id).await?;
            if let Some(user) = user {
                let email = user.0.clone();
                let token = user.1.clone();
                let did = user.2.clone();
                let client_id = user.3.clone();
                let client_secret = user.4.clone();
                let cancel = CancellationToken::new();
                let cache = cache.clone();
                let nc = nc.clone();
                let pool_clone = pool.clone();

                task_map
                    .lock()
                    .unwrap()
                    .insert(email.clone(), cancel.clone());

                start_user_task(
                    email,
                    token,
                    did,
                    client_id,
                    client_secret,
                    cancel,
                    cache,
                    nc,
                    pool_clone,
                );
            }
        }
    }

    Ok(())
}

pub async fn refresh_token(
    token: &str,
    client_id: &str,
    client_secret: &str,
    pool: &Pool<Postgres>,
    email: &str,
) -> Result<AccessToken, Error> {
    let client = Client::new();

    let response = client
        .post("https://accounts.spotify.com/api/token")
        .basic_auth(&client_id, Some(client_secret))
        .form(&[
            ("grant_type", "refresh_token"),
            ("refresh_token", token),
            ("client_id", &client_id),
        ])
        .send()
        .await?;
    let status = response.status();
    let body = response.text().await?;

    if !status.is_success() {
        if let Ok(err_json) = serde_json::from_str::<serde_json::Value>(&body) {
            if err_json.get("error").and_then(|v| v.as_str()) == Some("invalid_grant") {
                tracing::info!(
                    email = %email,
                    "refresh token revoked/expired, removing from spotify_tokens"
                );
                if let Err(e) = delete_spotify_token_by_email(pool, email).await {
                    tracing::error!(
                        email = %email,
                        error = %e,
                        "failed to delete spotify token"
                    );
                }
                return Err(Error::msg(format!("refresh token revoked for {}", email)));
            }
        }
        return Err(Error::msg(format!(
            "token refresh failed ({}): {}",
            status, body
        )));
    }

    let json_token = serde_json::from_str::<AccessToken>(&body);
    if let Err(e) = json_token {
        tracing::error!(body = %body, "error parsing token");
        return Err(Error::from(e));
    }
    Ok(json_token.unwrap())
}

pub async fn delete_spotify_token_by_email(
    pool: &Pool<Postgres>,
    email: &str,
) -> Result<(), Error> {
    sqlx::query(
        r#"
        DELETE FROM spotify_tokens
        USING spotify_accounts
        WHERE spotify_tokens.user_id = spotify_accounts.user_id
          AND spotify_accounts.email = $1
        "#,
    )
    .bind(email)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_currently_playing(
    cache: Cache,
    user_id: &str,
    token: &str,
    client_id: &str,
    client_secret: &str,
    pool: &Pool<Postgres>,
) -> Result<Option<(CurrentlyPlaying, bool)>, Error> {
    if let Ok(Some(data)) = cache.get(user_id).await {
        tracing::debug!(email = %user_id, "using cache");
        if data == "No content" {
            return Ok(None);
        }
        let decoded_data = serde_json::from_str::<CurrentlyPlaying>(&data);

        if decoded_data.is_err() {
            tracing::warn!(email = %user_id, data = %data, "cache is invalid");
            cache.setex(user_id, "No content", 10).await?;
            cache.del(&format!("{}:current", user_id)).await?;
            return Ok(None);
        }

        let data: CurrentlyPlaying = decoded_data.unwrap();
        // detect if the song has changed
        let previous = cache.get(&format!("{}:previous", user_id)).await;

        if let Err(e) = &previous {
            tracing::error!(email = %user_id, error = %e, "redis error");
            return Ok(None);
        }

        let previous = previous.unwrap();

        let changed = match previous {
            Some(previous) => {
                if serde_json::from_str::<CurrentlyPlaying>(&previous).is_err() {
                    tracing::warn!(
                        email = %user_id,
                        previous = %previous,
                        "previous cache is invalid"
                    );
                    return Ok(None);
                }

                let previous: CurrentlyPlaying = serde_json::from_str(&previous)?;
                if previous.item.is_none() && data.item.is_some() {
                    return Ok(Some((data, true)));
                }

                if previous.item.is_some() && data.item.is_none() {
                    return Ok(Some((data, false)));
                }

                if previous.item.is_none() && data.item.is_none() {
                    return Ok(Some((data, false)));
                }

                let previous_item = previous.item.unwrap();
                let data_item = data.clone().item.unwrap();
                previous_item.id != data_item.id
                    && previous.progress_ms.unwrap_or(0) != data.progress_ms.unwrap_or(0)
            }
            _ => true,
        };
        return Ok(Some((data, changed)));
    }

    let token = refresh_token(token, client_id, client_secret, pool, user_id).await?;
    let client = Client::new();
    let response = client
        .get(format!("{}/me/player/currently-playing", BASE_URL))
        .bearer_auth(token.access_token)
        .send()
        .await?;

    let headers = response.headers().clone();
    let status = response.status().as_u16();
    let data = response.text().await?;

    if !data.contains("is_playing") && !data.contains("context") {
        tracing::debug!(data = %data, "currently playing response");
    }

    if status == 429 {
        let retry_after = headers
            .get("retry-after")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        tracing::warn!(
            email = %user_id,
            retry_after = %retry_after,
            "too many requests"
        );
        return Ok(None);
    }

    let previous = cache.get(&format!("{}:previous", user_id)).await;
    if let Err(e) = &previous {
        tracing::error!(email = %user_id, error = %e, "redis error");
        return Ok(None);
    }

    let previous = previous.unwrap();

    // check if status code is 204
    if status == 204 {
        tracing::debug!("no content");
        match cache
            .setex(
                user_id,
                "No content",
                match previous.is_none() {
                    true => 30,
                    false => 10,
                },
            )
            .await
        {
            Ok(_) => {}
            Err(e) => {
                tracing::error!(email = %user_id, error = %e, "redis error");
                return Ok(None);
            }
        }
        match cache.del(&format!("{}:current", user_id)).await {
            Ok(_) => {}
            Err(e) => {
                tracing::error!(email = %user_id, error = %e, "redis error");
                return Ok(None);
            }
        }
        return Ok(None);
    }

    if serde_json::from_str::<CurrentlyPlaying>(&data).is_err() {
        tracing::warn!(email = %user_id, data = %data, "invalid data received");
        match cache.setex(user_id, "No content", 10).await {
            Ok(_) => {}
            Err(e) => {
                tracing::error!(email = %user_id, error = %e, "redis error");
                return Ok(None);
            }
        }
        match cache.del(&format!("{}:current", user_id)).await {
            Ok(_) => {}
            Err(e) => {
                tracing::error!(email = %user_id, error = %e, "redis error");
                return Ok(None);
            }
        }
        return Ok(None);
    }

    let data = serde_json::from_str::<CurrentlyPlaying>(&data)?;

    match cache
        .setex(
            user_id,
            &serde_json::to_string(&data)?,
            match previous.is_none() {
                true => 30,
                false => 15,
            },
        )
        .await
    {
        Ok(_) => {}
        Err(e) => {
            tracing::error!(email = %user_id, error = %e, "redis error");
            return Ok(None);
        }
    }
    match cache.del(&format!("{}:current", user_id)).await {
        Ok(_) => {}
        Err(e) => {
            tracing::error!(email = %user_id, error = %e, "redis error");
            return Ok(None);
        }
    }

    // detect if the song has changed
    let previous = cache.get(&format!("{}:previous", user_id)).await;

    if let Err(e) = &previous {
        tracing::error!(email = %user_id, error = %e, "redis error");
        return Ok(None);
    }

    let previous = previous.unwrap();
    let changed = match previous {
        Some(previous) => {
            if serde_json::from_str::<CurrentlyPlaying>(&previous).is_err() {
                tracing::warn!(
                    email = %user_id,
                    previous = %previous,
                    "previous cache is invalid"
                );
                return Ok(None);
            }

            let previous: CurrentlyPlaying = serde_json::from_str(&previous)?;
            if previous.item.is_none() || data.item.is_none() {
                return Ok(Some((data, false)));
            }

            let previous_item = previous.item.unwrap();
            let data_item = data.clone().item.unwrap();

            previous_item.id != data_item.id
                && previous.progress_ms.unwrap_or(0) != data.progress_ms.unwrap_or(0)
        }
        _ => data.item.is_some(),
    };

    // save as previous song
    match cache
        .setex(
            &format!("{}:previous", user_id),
            &serde_json::to_string(&data)?,
            600,
        )
        .await
    {
        Ok(_) => {}
        Err(e) => {
            tracing::error!(email = %user_id, error = %e, "redis error");
            return Ok(None);
        }
    }

    Ok(Some((data, changed)))
}

pub async fn get_artist(
    cache: Cache,
    artist_id: &str,
    token: &str,
    client_id: &str,
    client_secret: &str,
    pool: &Pool<Postgres>,
    email: &str,
) -> Result<Option<Artist>, Error> {
    if let Ok(Some(data)) = cache.get(artist_id).await {
        return Ok(Some(serde_json::from_str(&data)?));
    }

    let token = refresh_token(token, client_id, client_secret, pool, email).await?;
    let client = Client::new();
    let response = client
        .get(&format!("{}/artists/{}", BASE_URL, artist_id))
        .bearer_auth(token.access_token)
        .send()
        .await?;

    let headers = response.headers().clone();
    let data = response.text().await?;

    if data == "Too many requests" {
        let retry_after = headers
            .get("retry-after")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        tracing::warn!(
            scope = "get_artist",
            artist_id = %artist_id,
            retry_after = %retry_after,
            "too many requests"
        );
        return Ok(None);
    }

    match cache.setex(artist_id, &data, 20).await {
        Ok(_) => {}
        Err(e) => {
            tracing::error!(artist_id = %artist_id, error = %e, "redis error");
            return Ok(None);
        }
    }

    Ok(Some(serde_json::from_str(&data)?))
}

pub async fn get_album(
    cache: Cache,
    album_id: &str,
    token: &str,
    client_id: &str,
    client_secret: &str,
    pool: &Pool<Postgres>,
    email: &str,
) -> Result<Option<Album>, Error> {
    if let Ok(Some(data)) = cache.get(album_id).await {
        return Ok(Some(serde_json::from_str(&data)?));
    }

    let token = refresh_token(token, client_id, client_secret, pool, email).await?;
    let client = Client::new();
    let response = client
        .get(&format!("{}/albums/{}", BASE_URL, album_id))
        .bearer_auth(token.access_token)
        .send()
        .await?;

    let headers = response.headers().clone();
    let data = response.text().await?;

    if data == "Too many requests" {
        let retry_after = headers
            .get("retry-after")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        tracing::warn!(
            scope = "get_album",
            album_id = %album_id,
            retry_after = %retry_after,
            "too many requests"
        );
        return Ok(None);
    }

    match cache.setex(album_id, &data, 20).await {
        Ok(_) => {}
        Err(e) => {
            tracing::error!(album_id = %album_id, error = %e, "redis error");
            return Ok(None);
        }
    }

    Ok(Some(serde_json::from_str(&data)?))
}

pub async fn get_album_tracks(
    cache: Cache,
    album_id: &str,
    token: &str,
    client_id: &str,
    client_secret: &str,
    pool: &Pool<Postgres>,
    email: &str,
) -> Result<AlbumTracks, Error> {
    if let Ok(Some(data)) = cache.get(&format!("{}:tracks", album_id)).await {
        return Ok(serde_json::from_str(&data)?);
    }

    let token = refresh_token(token, client_id, client_secret, pool, email).await?;
    let client = Client::new();
    let mut all_tracks = Vec::new();
    let mut offset = 0;
    let limit = 50;

    loop {
        let response = client
            .get(&format!("{}/albums/{}/tracks", BASE_URL, album_id))
            .bearer_auth(&token.access_token)
            .query(&[
                ("limit", &limit.to_string()),
                ("offset", &offset.to_string()),
            ])
            .send()
            .await?;

        let headers = response.headers().clone();
        let data = response.text().await?;
        if data == "Too many requests" {
            let retry_after = headers
                .get("retry-after")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("");
            tracing::warn!(
                scope = "get_album_tracks",
                album_id = %album_id,
                retry_after = %retry_after,
                "too many requests"
            );
            continue;
        }

        let album_tracks: AlbumTracks = serde_json::from_str(&data)?;

        if album_tracks.items.is_empty() {
            break;
        }

        all_tracks.extend(album_tracks.items);
        offset += limit;
    }

    let all_tracks_json = serde_json::to_string(&all_tracks)?;
    match cache
        .setex(&format!("{}:tracks", album_id), &all_tracks_json, 20)
        .await
    {
        Ok(_) => {}
        Err(e) => {
            tracing::error!(album_id = %album_id, error = %e, "redis error");
        }
    }

    Ok(AlbumTracks {
        items: all_tracks,
        ..Default::default()
    })
}

pub async fn find_spotify_users(
    pool: &Pool<Postgres>,
    offset: usize,
    limit: usize,
) -> Result<Vec<(String, String, String, String, String)>, Error> {
    let results: Vec<SpotifyTokenWithEmail> = sqlx::query_as(
        r#"
    SELECT * FROM spotify_tokens
    LEFT JOIN spotify_accounts ON spotify_tokens.user_id = spotify_accounts.user_id
    LEFT JOIN users ON spotify_accounts.user_id = users.xata_id
    LEFT JOIN spotify_apps ON spotify_tokens.spotify_app_id = spotify_apps.spotify_app_id
    LIMIT $1 OFFSET $2
  "#,
    )
    .bind(limit as i64)
    .bind(offset as i64)
    .fetch_all(pool)
    .await?;

    let mut user_tokens = vec![];

    for result in &results {
        let token = decrypt_aes_256_ctr(
            &result.refresh_token,
            &hex::decode(env::var("SPOTIFY_ENCRYPTION_KEY")?)?,
        )?;
        let spotify_secret = decrypt_aes_256_ctr(
            &result.spotify_secret,
            &hex::decode(env::var("SPOTIFY_ENCRYPTION_KEY")?)?,
        )?;
        user_tokens.push((
            result.email.clone(),
            token,
            result.did.clone(),
            result.spotify_app_id.clone(),
            spotify_secret,
        ));
    }

    Ok(user_tokens)
}

pub async fn find_spotify_user(
    pool: &Pool<Postgres>,
    email: &str,
) -> Result<Option<(String, String, String, String, String)>, Error> {
    let result: Vec<SpotifyTokenWithEmail> = sqlx::query_as(
        r#"
    SELECT * FROM spotify_tokens
    LEFT JOIN spotify_accounts ON spotify_tokens.user_id = spotify_accounts.user_id
    LEFT JOIN users ON spotify_accounts.user_id = users.xata_id
    LEFT JOIN spotify_apps ON spotify_tokens.spotify_app_id = spotify_apps.spotify_app_id
    WHERE spotify_accounts.email = $1
  "#,
    )
    .bind(email)
    .fetch_all(pool)
    .await?;

    match result.first() {
        Some(result) => {
            let token = decrypt_aes_256_ctr(
                &result.refresh_token,
                &hex::decode(env::var("SPOTIFY_ENCRYPTION_KEY")?)?,
            )?;
            let spotify_secret = decrypt_aes_256_ctr(
                &result.spotify_secret,
                &hex::decode(env::var("SPOTIFY_ENCRYPTION_KEY")?)?,
            )?;
            Ok(Some((
                result.email.clone(),
                token,
                result.did.clone(),
                result.spotify_app_id.clone(),
                spotify_secret,
            )))
        }
        None => Ok(None),
    }
}

pub async fn watch_currently_playing(
    spotify_email: String,
    token: String,
    did: String,
    cancel: CancellationToken,
    cache: Cache,
    client_id: String,
    client_secret: String,
    nc: async_nats::Client,
    pool: Pool<Postgres>,
) -> Result<(), Error> {
    tracing::info!(email = %spotify_email, "checking currently playing");

    let cancel_clone = cancel.clone();
    let spotify_email_clone = spotify_email.clone();
    let cache_clone = cache.clone();
    tokio::spawn(async move {
        // Inner task with error recovery
        let result: Result<(), Error> = async {
            loop {
                if cancel_clone.is_cancelled() {
                    tracing::info!(
                        email = %spotify_email_clone,
                        "stopping progress tracker task"
                    );
                    break;
                }

                if let Ok(Some(cached)) = cache_clone
                    .get(&format!("{}:current", spotify_email_clone))
                    .await
                {
                    if let Ok(mut current_song) = serde_json::from_str::<CurrentlyPlaying>(&cached)
                    {
                        if let Some(item) = current_song.item.clone() {
                            if current_song.is_playing
                                && current_song.progress_ms.unwrap_or(0) < item.duration_ms.into()
                            {
                                current_song.progress_ms =
                                    Some(current_song.progress_ms.unwrap_or(0) + 800);
                                match cache_clone
                                    .setex(
                                        &format!("{}:current", spotify_email_clone),
                                        &serde_json::to_string(&current_song).unwrap_or_default(),
                                        16,
                                    )
                                    .await
                                {
                                    Ok(_) => {}
                                    Err(e) => {
                                        tracing::error!(
                                            email = %spotify_email_clone,
                                            error = %e,
                                            "redis error"
                                        );
                                    }
                                }
                                tokio::time::sleep(Duration::from_millis(800)).await;
                                continue;
                            }
                        }
                    }
                }

                if let Ok(Some(cached)) = cache_clone.get(&spotify_email_clone).await {
                    if cached != "No content" {
                        match cache_clone
                            .setex(&format!("{}:current", spotify_email_clone), &cached, 16)
                            .await
                        {
                            Ok(_) => {}
                            Err(e) => {
                                tracing::error!(
                                    email = %spotify_email_clone,
                                    error = %e,
                                    "redis error"
                                );
                            }
                        }
                    }
                }

                tokio::time::sleep(Duration::from_millis(800)).await;
            }
            Ok(())
        }
        .await;

        if let Err(e) = result {
            tracing::error!(
                email = %spotify_email_clone,
                error = %e,
                "progress tracker task error"
            );
        }
    });

    let mut was_playing = false;

    loop {
        if cancel.is_cancelled() {
            tracing::info!(email = %spotify_email, "stopping task");
            break;
        }
        let spotify_email = spotify_email.clone();
        let token = token.clone();
        let did = did.clone();
        let cache = cache.clone();
        let client_id = client_id.clone();
        let client_secret = client_secret.clone();
        let nc = nc.clone();

        let currently_playing = get_currently_playing(
            cache.clone(),
            &spotify_email,
            &token,
            &client_id,
            &client_secret,
            &pool,
        )
        .await;
        let currently_playing = match currently_playing {
            Ok(currently_playing) => currently_playing,
            Err(e) => {
                tracing::error!(email = %spotify_email, error = %e, "get_currently_playing failed");
                tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;
                continue;
            }
        };

        let (data, changed) = match currently_playing {
            None => {
                // 204 No Content or rate-limited — nothing is playing
                if was_playing {
                    was_playing = false;
                    let payload = serde_json::json!({ "did": did }).to_string().into_bytes();
                    if let Err(e) = nc.publish("rocksky.song.stopped", payload.into()).await {
                        tracing::error!(
                            email = %spotify_email,
                            error = %e,
                            "failed to publish song stopped event"
                        );
                    }
                }
                tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;
                continue;
            }
            Some((data, changed)) => {
                if data.item.is_none() {
                    tracing::debug!(email = %spotify_email, "no song playing");
                    if was_playing {
                        was_playing = false;
                        let payload = serde_json::json!({ "did": did }).to_string().into_bytes();
                        if let Err(e) = nc.publish("rocksky.song.stopped", payload.into()).await {
                            tracing::error!(
                                email = %spotify_email,
                                error = %e,
                                "failed to publish song stopped event"
                            );
                        }
                    }
                    tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;
                    continue;
                }
                (data, changed)
            }
        };
        {
            let data_item = data.item.unwrap();
            tracing::info!(
                email = %spotify_email,
                track = %data_item.name,
                artist = %data_item.artists[0].name,
                is_playing = data.is_playing,
                changed,
                "currently playing"
            );

            was_playing = true;

            if changed {
                cache
                    .setex(
                        &format!("changed:{}:{}", spotify_email, data_item.id),
                        &data_item.duration_ms.to_string(),
                        3600 * 24,
                    )
                    .await?;
                let payload = serde_json::json!({
                    "did": did,
                    "track": {
                        "id": data_item.id,
                        "name": data_item.name,
                        "duration_ms": data_item.duration_ms,
                        "progress_ms": data.progress_ms,
                        "is_playing": data.is_playing,
                        "artists": data_item.artists.iter().map(|a| serde_json::json!({ "id": a.id, "name": a.name })).collect::<Vec<_>>(),
                        "album": {
                            "id": data_item.album.id,
                            "name": data_item.album.name,
                            "cover": data_item.album.images.first().map(|i| &i.url),
                        }
                    }
                })
                .to_string()
                .into_bytes();
                if let Err(e) = nc.publish("rocksky.song.changed", payload.into()).await {
                    tracing::error!(
                        email = %spotify_email,
                        error = %e,
                        "failed to publish song changed event"
                    );
                }
            }

            let current_track = match cache
                .get(&format!("changed:{}:{}", spotify_email, data_item.id))
                .await
            {
                Ok(x) => x.is_some(),
                Err(_) => false,
            };

            if let Ok(Some(cached)) = cache.get(&format!("{}:current", spotify_email)).await {
                let current_song = serde_json::from_str::<CurrentlyPlaying>(&cached)?;
                if let Some(item) = current_song.item {
                    let percentage = current_song.progress_ms.unwrap_or(0) as f32
                        / data_item.duration_ms as f32
                        * 100.0;
                    if current_track && percentage >= 40.0 && item.id == data_item.id {
                        tracing::info!(
                            email = %spotify_email,
                            track = %item.name,
                            percentage = format!("{:.2}", percentage),
                            "scrobbling track"
                        );
                        scrobble(
                            cache.clone(),
                            &spotify_email,
                            &did,
                            &token,
                            &client_id,
                            &client_secret,
                            &pool,
                        )
                        .await?;

                        match cache
                            .del(&format!("changed:{}:{}", spotify_email, data_item.id))
                            .await
                        {
                            Ok(_) => {}
                            Err(_) => tracing::error!("failed to delete cache entry"),
                        };

                        let pool_for_task = pool.clone();
                        tokio::spawn(async move {
                            let result: Result<(), Error> = async {
                                get_album_tracks(
                                    cache.clone(),
                                    &data_item.album.id,
                                    &token,
                                    &client_id,
                                    &client_secret,
                                    &pool_for_task,
                                    &spotify_email,
                                )
                                .await?;
                                get_album(
                                    cache.clone(),
                                    &data_item.album.id,
                                    &token,
                                    &client_id,
                                    &client_secret,
                                    &pool_for_task,
                                    &spotify_email,
                                )
                                .await?;
                                update_library(
                                    cache.clone(),
                                    &spotify_email,
                                    &did,
                                    &token,
                                    &client_id,
                                    &client_secret,
                                    &pool_for_task,
                                )
                                .await?;
                                Ok(())
                            }
                            .await;

                            if let Err(e) = result {
                                tracing::error!(
                                    email = %spotify_email,
                                    error = %e,
                                    "post-scrobble background work failed"
                                );
                            }
                        });
                    }
                }
            }
        }

        tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;
    }

    Ok(())
}
