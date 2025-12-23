use std::{
    collections::HashMap,
    env,
    sync::{atomic::AtomicBool, Arc, Mutex},
    thread,
};

use anyhow::Error;
use async_nats::connect;
use owo_colors::OwoColorize;
use reqwest::Client;
use sqlx::{postgres::PgPoolOptions, Pool, Postgres};
use tokio_stream::StreamExt;

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

pub const BASE_URL: &str = "https://spotify-api.rocksky.app/v1";

pub async fn run() -> Result<(), Error> {
    let cache = Cache::new()?;
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&env::var("XATA_POSTGRES_URL")?)
        .await?;

    let addr = env::var("NATS_URL").unwrap_or_else(|_| "nats://localhost:4222".to_string());
    let nc = connect(&addr).await?;
    println!("Connected to NATS server at {}", addr.bright_green());

    let mut sub = nc.subscribe("rocksky.spotify.user".to_string()).await?;
    println!("Subscribed to {}", "rocksky.spotify.user".bright_green());

    let users = find_spotify_users(&pool, 0, 500).await?;
    println!("Found {} users", users.len().bright_green());

    // Shared HashMap to manage threads and their stop flags
    let thread_map: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>> =
        Arc::new(Mutex::new(HashMap::new()));

    // Start threads for all users
    for user in users {
        let email = user.0.clone();
        let token = user.1.clone();
        let did = user.2.clone();
        let client_id = user.3.clone();
        let client_secret = user.4.clone();
        let stop_flag = Arc::new(AtomicBool::new(false));
        let cache = cache.clone();
        let nc = nc.clone();
        let thread_map = Arc::clone(&thread_map);

        thread_map
            .lock()
            .unwrap()
            .insert(email.clone(), Arc::clone(&stop_flag));

        thread::spawn(move || {
            let rt = tokio::runtime::Runtime::new().unwrap();
            match rt.block_on(async {
                watch_currently_playing(
                    email.clone(),
                    token,
                    did,
                    stop_flag,
                    cache.clone(),
                    client_id,
                    client_secret,
                )
                .await?;
                Ok::<(), Error>(())
            }) {
                Ok(_) => {}
                Err(e) => {
                    println!(
                        "{} Error starting thread for user: {} - {}",
                        format!("[{}]", email).bright_green(),
                        email.bright_green(),
                        e.to_string().bright_red()
                    );

                    // If there's an error, publish a message to restart the thread
                    match rt.block_on(nc.publish("rocksky.spotify.user", email.clone().into())) {
                        Ok(_) => {
                            println!(
                                "{} Published message to restart thread for user: {}",
                                format!("[{}]", email).bright_green(),
                                email.bright_green()
                            );
                        }
                        Err(e) => {
                            println!(
                                "{} Error publishing message to restart thread: {}",
                                format!("[{}]", email).bright_green(),
                                e.to_string().bright_red()
                            );
                        }
                    }
                }
            }
        });
    }

    // Handle subscription messages
    while let Some(message) = sub.next().await {
        let user_id = String::from_utf8(message.payload.to_vec()).unwrap();
        println!(
            "Received message to restart thread for user: {}",
            user_id.bright_green()
        );

        let mut thread_map = thread_map.lock().unwrap();

        // Check if the user exists in the thread map
        if let Some(stop_flag) = thread_map.get(&user_id) {
            // Stop the existing thread
            stop_flag.store(true, std::sync::atomic::Ordering::Relaxed);

            // Create a new stop flag and restart the thread
            let new_stop_flag = Arc::new(AtomicBool::new(false));
            thread_map.insert(user_id.clone(), Arc::clone(&new_stop_flag));

            let user = find_spotify_user(&pool, &user_id).await?;

            if user.is_none() {
                println!(
                    "Spotify user not found: {}, skipping",
                    user_id.bright_green()
                );
                continue;
            }

            let user = user.unwrap();

            let email = user.0.clone();
            let token = user.1.clone();
            let did = user.2.clone();
            let client_id = user.3.clone();
            let client_secret = user.4.clone();
            let cache = cache.clone();

            thread::spawn(move || {
                let rt = tokio::runtime::Runtime::new().unwrap();
                match rt.block_on(async {
                    watch_currently_playing(
                        email.clone(),
                        token,
                        did,
                        new_stop_flag,
                        cache.clone(),
                        client_id,
                        client_secret,
                    )
                    .await?;
                    Ok::<(), Error>(())
                }) {
                    Ok(_) => {}
                    Err(e) => {
                        println!(
                            "{} Error restarting thread for user: {} - {}",
                            format!("[{}]", email).bright_green(),
                            email.bright_green(),
                            e.to_string().bright_red()
                        );
                    }
                }
            });

            println!("Restarted thread for user: {}", user_id.bright_green());
        } else {
            println!(
                "No thread found for user: {}, starting new thread",
                user_id.bright_green()
            );
            let user = find_spotify_user(&pool, &user_id).await?;
            if let Some(user) = user {
                let email = user.0.clone();
                let token = user.1.clone();
                let did = user.2.clone();
                let client_id = user.3.clone();
                let client_secret = user.4.clone();
                let stop_flag = Arc::new(AtomicBool::new(false));
                let cache = cache.clone();
                let nc = nc.clone();

                thread_map.insert(email.clone(), Arc::clone(&stop_flag));

                thread::spawn(move || {
                    let rt = tokio::runtime::Runtime::new().unwrap();
                    match rt.block_on(async {
                        watch_currently_playing(
                            email.clone(),
                            token,
                            did,
                            stop_flag,
                            cache.clone(),
                            client_id,
                            client_secret,
                        )
                        .await?;
                        Ok::<(), Error>(())
                    }) {
                        Ok(_) => {}
                        Err(e) => {
                            println!(
                                "{} Error starting thread for user: {} - {}",
                                format!("[{}]", email).bright_green(),
                                email.bright_green(),
                                e.to_string().bright_red()
                            );
                            match rt
                                .block_on(nc.publish("rocksky.spotify.user", email.clone().into()))
                            {
                                Ok(_) => {}
                                Err(e) => {
                                    println!(
                                        "{} Error publishing message to restart thread: {}",
                                        format!("[{}]", email).bright_green(),
                                        e.to_string().bright_red()
                                    );
                                }
                            }
                        }
                    }
                });
            }
        }
    }

    Ok(())
}

pub async fn refresh_token(
    token: &str,
    client_id: &str,
    client_secret: &str,
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
    let token = response.text().await?;
    let json_token = serde_json::from_str::<AccessToken>(&token);
    if let Err(e) = json_token {
        println!("Error parsing token: {}", token);
        return Err(Error::from(e));
    }
    Ok(json_token.unwrap())
}

pub async fn get_currently_playing(
    cache: Cache,
    user_id: &str,
    token: &str,
    client_id: &str,
    client_secret: &str,
) -> Result<Option<(CurrentlyPlaying, bool)>, Error> {
    // Helper: safely load and parse previous state
    let previous = {
        match cache.get(&format!("{}:previous", user_id))? {
            Some(prev_str) => match serde_json::from_str::<CurrentlyPlaying>(&prev_str) {
                Ok(prev) => Some(prev),
                Err(_) => {
                    println!(
                        "{} Previous cache invalid - ignoring previous state",
                        format!("[{}]", user_id).bright_green()
                    );
                    None
                }
            },
            None => None,
        }
    };

    // --- Cache hit path ---
    if let Ok(Some(data)) = cache.get(user_id) {
        println!(
            "{} {}",
            format!("[{}]", user_id).bright_green(),
            "Using cache".cyan()
        );

        if data == "No content" {
            return Ok(None);
        }

        let current: CurrentlyPlaying = match serde_json::from_str(&data) {
            Ok(c) => c,
            Err(_) => {
                println!(
                    "{} Cache is invalid: {}",
                    format!("[{}]", user_id).bright_green(),
                    data
                );
                cache.setex(user_id, "No content", 10)?;
                cache.del(&format!("{}:current", user_id))?;
                return Ok(None);
            }
        };

        let changed = compute_track_change(previous.as_ref(), &current, user_id);
        return Ok(Some((current, changed)));
    }

    // --- API call path ---
    let token = refresh_token(token, client_id, client_secret).await?;
    let client = Client::new();
    let response = client
        .get(format!("{}/me/player/currently-playing", BASE_URL))
        .bearer_auth(token.access_token)
        .send()
        .await?;

    let headers = response.headers().clone();
    let status = response.status().as_u16();
    let body_text = response.text().await?;

    if status == 429 {
        println!(
            "{} Too many requests, retry-after {}",
            format!("[{}]", user_id).bright_green(),
            headers
                .get("retry-after")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("unknown")
                .bright_green()
        );
        return Ok(None);
    }

    // Handle no content
    if status == 204 || body_text.trim().is_empty() || !body_text.contains("is_playing") {
        println!("{} No content", format!("[{}]", user_id).bright_green());
        let ttl = if previous.is_none() { 30 } else { 10 };
        cache.setex(user_id, "No content", ttl)?;
        cache.del(&format!("{}:current", user_id))?;
        return Ok(None);
    }

    let current: CurrentlyPlaying = match serde_json::from_str(&body_text) {
        Ok(c) => c,
        Err(_) => {
            println!(
                "{} Invalid data received from Spotify",
                format!("[{}]", user_id).bright_green()
            );
            cache.setex(user_id, "No content", 10)?;
            cache.del(&format!("{}:current", user_id))?;
            return Ok(None);
        }
    };

    // Cache current state
    let ttl = if previous.is_none() { 30 } else { 15 };
    cache.setex(user_id, &serde_json::to_string(&current)?, ttl)?;
    cache.del(&format!("{}:current", user_id))?;

    // Determine if this is a meaningful track change
    let changed = compute_track_change(previous.as_ref(), &current, user_id);

    // Always update previous state
    cache.setex(
        &format!("{}:previous", user_id),
        &serde_json::to_string(&current)?,
        600,
    )?;

    Ok(Some((current, changed)))
}

fn compute_track_change(
    previous: Option<&CurrentlyPlaying>,
    current: &CurrentlyPlaying,
    user_id: &str,
) -> bool {
    // Early exit: no previous state → safe, no change
    let Some(prev) = previous else {
        println!(
            "{} Change detection: NO PREVIOUS STATE → changed=false (cold start/restart)",
            format!("[{}]", user_id).bright_green()
        );
        return false;
    };

    // Early exit: nothing playing now
    let Some(curr_item) = current.item.as_ref() else {
        println!(
            "{} Change detection: currently NOTHING playing → changed=false",
            format!("[{}]", user_id).bright_green()
        );
        return false;
    };

    // Case: previous was paused/stopped → now playing anything = new track
    if prev.item.is_none() {
        println!(
            "{} Change detection: was PAUSED/STORED → now playing '{}' → changed=true",
            format!("[{}]", user_id).bright_green(),
            curr_item.name
        );
        return true;
    }

    let Some(prev_item) = prev.item.as_ref() else {
        println!(
            "{} Change detection: previous state corrupted (no item) → changed=false (safety)",
            format!("[{}]", user_id).bright_green()
        );
        return false;
    };

    // Same track → no change
    if prev_item.id == curr_item.id {
        println!(
            "{} Change detection: same track '{}' → changed=false",
            format!("[{}]", user_id).bright_green(),
            curr_item.name
        );
        return false;
    }

    // Different track → apply 50% rule
    let progress = prev.progress_ms.unwrap_or(0) as u64;
    let duration = prev_item.duration_ms as u64;
    let percent = if duration > 0 {
        (progress as f64 / duration as f64) * 100.0
    } else {
        0.0
    };

    let changed = duration > 0 && progress >= duration * 50 / 100;

    println!(
        "{} Change detection: prev='{}' ({:.1}% played), curr='{}' → changed={}",
        format!("[{}]", user_id).bright_green(),
        prev_item.name,
        percent,
        curr_item.name,
        changed
    );

    changed
}

pub async fn get_artist(
    cache: Cache,
    artist_id: &str,
    token: &str,
    client_id: &str,
    client_secret: &str,
) -> Result<Option<Artist>, Error> {
    if let Ok(Some(data)) = cache.get(artist_id) {
        return Ok(Some(serde_json::from_str(&data)?));
    }

    let token = refresh_token(token, client_id, client_secret).await?;
    let client = Client::new();
    let response = client
        .get(&format!("{}/artists/{}", BASE_URL, artist_id))
        .bearer_auth(token.access_token)
        .send()
        .await?;

    let headers = response.headers().clone();
    let data = response.text().await?;

    if data == "Too many requests" {
        println!(
            "> retry-after {}",
            headers.get("retry-after").unwrap().to_str().unwrap()
        );
        println!("> {} [get_artist]", data);
        return Ok(None);
    }

    match cache.setex(artist_id, &data, 20) {
        Ok(_) => {}
        Err(e) => {
            println!(
                "{} redis error: {}",
                format!("[{}]", artist_id).bright_green(),
                e.to_string().bright_red()
            );
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
) -> Result<Option<Album>, Error> {
    if let Ok(Some(data)) = cache.get(album_id) {
        return Ok(Some(serde_json::from_str(&data)?));
    }

    let token = refresh_token(token, client_id, client_secret).await?;
    let client = Client::new();
    let response = client
        .get(&format!("{}/albums/{}", BASE_URL, album_id))
        .bearer_auth(token.access_token)
        .send()
        .await?;

    let headers = response.headers().clone();
    let data = response.text().await?;

    if data == "Too many requests" {
        println!(
            "> retry-after {}",
            headers.get("retry-after").unwrap().to_str().unwrap()
        );
        println!("> {} [get_album]", data);
        return Ok(None);
    }

    match cache.setex(album_id, &data, 20) {
        Ok(_) => {}
        Err(e) => {
            println!(
                "{} redis error: {}",
                format!("[{}]", album_id).bright_green(),
                e.to_string().bright_red()
            );
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
) -> Result<AlbumTracks, Error> {
    if let Ok(Some(data)) = cache.get(&format!("{}:tracks", album_id)) {
        return Ok(serde_json::from_str(&data)?);
    }

    let token = refresh_token(token, client_id, client_secret).await?;
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
            println!(
                "> retry-after {}",
                headers.get("retry-after").unwrap().to_str().unwrap()
            );
            println!("> {} [get_album_tracks]", data);
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
    match cache.setex(&format!("{}:tracks", album_id), &all_tracks_json, 20) {
        Ok(_) => {}
        Err(e) => {
            println!(
                "{} redis error: {}",
                format!("[{}]", album_id).bright_green(),
                e.to_string().bright_red()
            );
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
    stop_flag: Arc<AtomicBool>,
    cache: Cache,
    client_id: String,
    client_secret: String,
) -> Result<(), Error> {
    println!(
        "{} {}",
        format!("[{}]", spotify_email).bright_green(),
        "Checking currently playing".cyan()
    );

    let stop_flag_clone = stop_flag.clone();
    let spotify_email_clone = spotify_email.clone();
    let cache_clone = cache.clone();

    thread::spawn(move || {
        loop {
            if stop_flag_clone.load(std::sync::atomic::Ordering::Relaxed) {
                println!(
                    "{} Stopping Thread",
                    format!("[{}]", spotify_email_clone).bright_green()
                );
                break;
            }
            if let Ok(Some(cached)) = cache_clone.get(&format!("{}:current", spotify_email_clone)) {
                if serde_json::from_str::<CurrentlyPlaying>(&cached).is_err() {
                    thread::sleep(std::time::Duration::from_millis(800));
                    continue;
                }

                let mut current_song = serde_json::from_str::<CurrentlyPlaying>(&cached)?;

                if let Some(item) = current_song.item.clone() {
                    if current_song.is_playing
                        && current_song.progress_ms.unwrap_or(0) < item.duration_ms.into()
                    {
                        current_song.progress_ms =
                            Some(current_song.progress_ms.unwrap_or(0) + 800);
                        match cache_clone.setex(
                            &format!("{}:current", spotify_email_clone),
                            &serde_json::to_string(&current_song)?,
                            16,
                        ) {
                            Ok(_) => {}
                            Err(e) => {
                                println!(
                                    "{} redis error: {}",
                                    format!("[{}]", spotify_email_clone).bright_green(),
                                    e.to_string().bright_red()
                                );
                            }
                        }
                        thread::sleep(std::time::Duration::from_millis(800));
                        continue;
                    }
                }
                continue;
            }

            if let Ok(Some(cached)) = cache_clone.get(&spotify_email_clone) {
                if cached == "No content" {
                    thread::sleep(std::time::Duration::from_millis(800));
                    continue;
                }
                match cache_clone.setex(&format!("{}:current", spotify_email_clone), &cached, 16) {
                    Ok(_) => {}
                    Err(e) => {
                        println!(
                            "{} redis error: {}",
                            format!("[{}]", spotify_email_clone).bright_green(),
                            e.to_string().bright_red()
                        );
                    }
                }
            }

            thread::sleep(std::time::Duration::from_millis(800));
        }
        Ok::<(), Error>(())
    });

    loop {
        if stop_flag.load(std::sync::atomic::Ordering::Relaxed) {
            println!(
                "{} Stopping Thread",
                format!("[{}]", spotify_email).bright_green()
            );
            break;
        }
        let spotify_email = spotify_email.clone();
        let token = token.clone();
        let did = did.clone();
        let cache = cache.clone();
        let client_id = client_id.clone();
        let client_secret = client_secret.clone();

        let currently_playing = get_currently_playing(
            cache.clone(),
            &spotify_email,
            &token,
            &client_id,
            &client_secret,
        )
        .await;
        let currently_playing = match currently_playing {
            Ok(currently_playing) => currently_playing,
            Err(e) => {
                println!(
                    "{} {}",
                    format!("[{}]", spotify_email).bright_green(),
                    e.to_string().bright_red()
                );
                tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;
                continue;
            }
        };

        if let Some((data, changed)) = currently_playing {
            if data.item.is_none() {
                println!(
                    "{} {}",
                    format!("[{}]", spotify_email).bright_green(),
                    "No song playing".yellow()
                );
                tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;
                continue;
            }
            let data_item = data.item.unwrap();
            println!(
                "{} {} is_playing: {} changed: {}",
                format!("[{}]", spotify_email).bright_green(),
                format!("{} - {}", data_item.name, data_item.artists[0].name).yellow(),
                data.is_playing,
                changed
            );

            if changed {
                scrobble(
                    cache.clone(),
                    &spotify_email,
                    &did,
                    &token,
                    &client_id,
                    &client_secret,
                )
                .await?;

                thread::spawn(move || {
                    let rt = tokio::runtime::Runtime::new().unwrap();
                    match rt.block_on(async {
                        get_album_tracks(
                            cache.clone(),
                            &data_item.album.id,
                            &token,
                            &client_id,
                            &client_secret,
                        )
                        .await?;
                        get_album(
                            cache.clone(),
                            &data_item.album.id,
                            &token,
                            &client_id,
                            &client_secret,
                        )
                        .await?;
                        update_library(
                            cache.clone(),
                            &spotify_email,
                            &did,
                            &token,
                            &client_id,
                            &client_secret,
                        )
                        .await?;
                        Ok::<(), Error>(())
                    }) {
                        Ok(_) => {}
                        Err(e) => {
                            println!(
                                "{} {}",
                                format!("[{}]", spotify_email).bright_green(),
                                e.to_string().bright_red()
                            );
                        }
                    }
                });
            }
        }

        tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;
    }

    Ok(())
}
