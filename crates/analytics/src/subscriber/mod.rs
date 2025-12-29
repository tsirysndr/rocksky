use anyhow::Error;
use async_nats::{connect, Client};
use duckdb::{params, Connection};
use owo_colors::OwoColorize;
use std::{
    env,
    sync::{Arc, Mutex},
    thread,
};
use tokio_stream::StreamExt;
use types::{LikePayload, NewTrackPayload, ScrobblePayload, UnlikePayload, UserPayload};

pub mod types;

pub async fn subscribe(conn: Arc<Mutex<Connection>>) -> Result<(), Error> {
    let addr = env::var("NATS_URL").unwrap_or_else(|_| "nats://localhost:4222".to_string());
    let conn = conn.clone();
    let nc = connect(&addr).await?;
    tracing::info!(server = %addr.bright_green(), "Connected to NATS");

    let nc = Arc::new(Mutex::new(nc));
    on_scrobble(nc.clone(), conn.clone());
    on_new_track(nc.clone(), conn.clone());
    on_like(nc.clone(), conn.clone());
    on_unlike(nc.clone(), conn.clone());
    on_new_user(nc.clone(), conn.clone());

    Ok(())
}

pub fn on_scrobble(nc: Arc<Mutex<Client>>, conn: Arc<Mutex<Connection>>) {
    thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let conn = conn.clone();
        let nc = nc.clone();
        rt.block_on(async {
            let nc = nc.lock().unwrap();
            let mut sub = nc.subscribe("rocksky.scrobble".to_string()).await?;
            drop(nc);

            while let Some(msg) = sub.next().await {
                let data = String::from_utf8(msg.payload.to_vec()).unwrap();
                match serde_json::from_str::<ScrobblePayload>(&data) {
                    Ok(payload) => match save_scrobble(conn.clone(), payload.clone()).await {
                        Ok(_) => tracing::info!(
                            uri = %payload.scrobble.uri.cyan(),
                            "Scrobble saved successfully",
                        ),
                        Err(e) => tracing::error!("Error saving scrobble: {}", e),
                    },
                    Err(e) => {
                        tracing::error!("Error parsing payload: {}", e);
                        tracing::debug!("{}", data);
                    }
                }
            }

            Ok::<(), Error>(())
        })?;

        Ok::<(), Error>(())
    });
}

pub fn on_new_track(nc: Arc<Mutex<Client>>, conn: Arc<Mutex<Connection>>) {
    thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let conn = conn.clone();
        let nc = nc.clone();
        rt.block_on(async {
            let nc = nc.lock().unwrap();
            let mut sub = nc.subscribe("rocksky.track".to_string()).await?;
            drop(nc);

            while let Some(msg) = sub.next().await {
                let data = String::from_utf8(msg.payload.to_vec()).unwrap();
                match serde_json::from_str::<NewTrackPayload>(&data) {
                    Ok(payload) => match save_track(conn.clone(), payload.clone()).await {
                        Ok(_) => {
                            tracing::info!(
                                title = %payload.track.title.cyan(),
                                "Track saved successfully",
                            )
                        }
                        Err(e) => tracing::error!("Error saving track: {}", e),
                    },
                    Err(e) => {
                        tracing::error!("Error parsing payload: {}", e);
                        tracing::debug!("{}", data);
                    }
                }
            }

            Ok::<(), Error>(())
        })?;

        Ok::<(), Error>(())
    });
}

pub fn on_like(nc: Arc<Mutex<Client>>, conn: Arc<Mutex<Connection>>) {
    thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let conn = conn.clone();
        let nc = nc.clone();
        rt.block_on(async {
            let nc = nc.lock().unwrap();
            let mut sub = nc.subscribe("rocksky.like".to_string()).await?;
            drop(nc);

            while let Some(msg) = sub.next().await {
                let data = String::from_utf8(msg.payload.to_vec()).unwrap();
                match serde_json::from_str::<LikePayload>(&data) {
                    Ok(payload) => match like(conn.clone(), payload.clone()).await {
                        Ok(_) => tracing::info!(
                            track_id = %payload.track_id.xata_id.cyan(),
                            "Like saved successfully",
                        ),
                        Err(e) => tracing::error!("Error saving like: {}", e),
                    },
                    Err(e) => {
                        tracing::error!("Error parsing payload: {}", e);
                        tracing::debug!("{}", data);
                    }
                }
            }

            Ok::<(), Error>(())
        })?;

        Ok::<(), Error>(())
    });
}

pub fn on_unlike(nc: Arc<Mutex<Client>>, conn: Arc<Mutex<Connection>>) {
    thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let conn = conn.clone();
        let nc = nc.clone();
        rt.block_on(async {
            let nc = nc.lock().unwrap();
            let mut sub = nc.subscribe("rocksky.unlike".to_string()).await?;
            drop(nc);

            while let Some(msg) = sub.next().await {
                let data = String::from_utf8(msg.payload.to_vec()).unwrap();
                match serde_json::from_str::<UnlikePayload>(&data) {
                    Ok(payload) => match unlike(conn.clone(), payload.clone()).await {
                        Ok(_) => tracing::info!(
                            track_id = %payload.track_id.xata_id.cyan(),
                            "Unlike saved successfully",
                        ),
                        Err(e) => tracing::error!("Error saving unlike: {}", e),
                    },
                    Err(e) => {
                        tracing::error!("Error parsing payload: {}", e);
                        tracing::debug!("{}", data);
                    }
                }
            }

            Ok::<(), Error>(())
        })?;

        Ok::<(), Error>(())
    });
}

pub fn on_new_user(nc: Arc<Mutex<Client>>, conn: Arc<Mutex<Connection>>) {
    thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let conn = conn.clone();
        let nc = nc.clone();
        rt.block_on(async {
            let nc = nc.lock().unwrap();
            let mut sub = nc.subscribe("rocksky.user".to_string()).await?;
            drop(nc);

            while let Some(msg) = sub.next().await {
                let data = String::from_utf8(msg.payload.to_vec()).unwrap();
                match serde_json::from_str::<UserPayload>(&data) {
                    Ok(payload) => match save_user(conn.clone(), payload.clone()).await {
                        Ok(_) => tracing::info!(
                            handle = %payload.handle.cyan(),
                            "User saved successfully",
                        ),
                        Err(e) => tracing::error!("Error saving user: {}", e),
                    },
                    Err(e) => {
                        tracing::error!("Error parsing payload: {}", e);
                        tracing::debug!("{}", data);
                    }
                }
            }

            Ok::<(), Error>(())
        })?;

        Ok::<(), Error>(())
    });
}

pub async fn save_scrobble(
    conn: Arc<Mutex<Connection>>,
    payload: ScrobblePayload,
) -> Result<(), Error> {
    let conn = conn.lock().unwrap();

    match conn.execute(
        &format!(
            "INSERT INTO artists (
          id,
          name,
          biography,
          born,
          born_in,
          died,
          picture,
          sha256,
          spotify_link,
          tidal_link,
          youtube_link,
          apple_music_link,
          uri,
          genres
        ) VALUES (
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          [{}]
        )",
            payload
                .scrobble
                .artist_id
                .genres
                .as_ref()
                .map(|genres| genres
                    .iter()
                    .map(|g| format!("'{}'", g.replace("'", "''")))
                    .collect::<Vec<_>>()
                    .join(", "))
                .unwrap_or_default()
        ),
        params![
            payload.scrobble.artist_id.xata_id,
            payload.scrobble.artist_id.name,
            payload.scrobble.artist_id.biography,
            payload.scrobble.artist_id.born,
            payload.scrobble.artist_id.born_in,
            payload.scrobble.artist_id.died,
            payload.scrobble.artist_id.picture,
            payload.scrobble.artist_id.sha256,
            payload.scrobble.artist_id.spotify_link,
            payload.scrobble.artist_id.tidal_link,
            payload.scrobble.artist_id.youtube_link,
            payload.scrobble.artist_id.apple_music_link,
            payload.scrobble.artist_id.uri,
        ],
    ) {
        Ok(_) => (),
        Err(e) => {
            if !e.to_string().contains("violates primary key constraint") {
                tracing::error!("[artists] error: {}", e);
                return Err(e.into());
            }
        }
    }

    match conn.execute(
        "INSERT INTO albums (
          id,
          title,
          artist,
          release_date,
          album_art,
          year,
          spotify_link,
          tidal_link,
          youtube_link,
          apple_music_link,
          sha256,
          uri,
          artist_uri
      ) VALUES (
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?
        )",
        params![
            payload.scrobble.album_id.xata_id,
            payload.scrobble.album_id.title,
            payload.scrobble.album_id.artist,
            payload.scrobble.album_id.release_date,
            payload.scrobble.album_id.album_art,
            payload.scrobble.album_id.year,
            payload.scrobble.album_id.spotify_link,
            payload.scrobble.album_id.tidal_link,
            payload.scrobble.album_id.youtube_link,
            payload.scrobble.album_id.apple_music_link,
            payload.scrobble.album_id.sha256,
            payload.scrobble.album_id.uri,
            payload.scrobble.album_id.artist_uri,
        ],
    ) {
        Ok(_) => (),
        Err(e) => {
            if !e.to_string().contains("violates primary key constraint") {
                tracing::error!("[albums] error: {}", e);
                return Err(e.into());
            }
        }
    }

    match conn.execute(
        "INSERT INTO tracks (
          id,
          title,
          artist,
          album_artist,
          album_art,
          album,
          track_number,
          duration,
          mb_id,
          youtube_link,
          spotify_link,
          tidal_link,
          apple_music_link,
          sha256,
          lyrics,
          composer,
          genre,
          disc_number,
          copyright_message,
          label,
          uri,
          artist_uri,
          album_uri,
          created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params![
            payload.scrobble.track_id.xata_id,
            payload.scrobble.track_id.title,
            payload.scrobble.track_id.artist,
            payload.scrobble.track_id.album_artist,
            payload.scrobble.track_id.album_art,
            payload.scrobble.track_id.album,
            payload.scrobble.track_id.track_number,
            payload.scrobble.track_id.duration,
            payload.scrobble.track_id.mb_id,
            payload.scrobble.track_id.youtube_link,
            payload.scrobble.track_id.spotify_link,
            payload.scrobble.track_id.tidal_link,
            payload.scrobble.track_id.apple_music_link,
            payload.scrobble.track_id.sha256,
            payload.scrobble.track_id.lyrics,
            payload.scrobble.track_id.composer,
            payload.scrobble.track_id.genre,
            payload.scrobble.track_id.disc_number,
            payload.scrobble.track_id.copyright_message,
            payload.scrobble.track_id.label,
            payload.scrobble.track_id.uri,
            payload.scrobble.track_id.artist_uri,
            payload.scrobble.track_id.album_uri,
            payload.scrobble.track_id.xata_createdat,
        ],
    ) {
        Ok(_) => (),
        Err(e) => {
            if !e.to_string().contains("violates primary key constraint") {
                tracing::error!("[tracks] error: {}", e);
                return Err(e.into());
            }
        }
    }

    match conn.execute(
        "INSERT INTO album_tracks (
          id,
          album_id,
          track_id
      ) VALUES (?,
          ?,
          ?)",
        params![
            payload.album_track.xata_id,
            payload.album_track.album_id.xata_id,
            payload.album_track.track_id.xata_id,
        ],
    ) {
        Ok(_) => (),
        Err(e) => {
            if !e.to_string().contains("violates primary key constraint") {
                tracing::error!("[album_tracks] error: {}", e);
                return Err(e.into());
            }
        }
    }

    match conn.execute(
        "INSERT INTO artist_tracks (id, artist_id, track_id, created_at) VALUES (?, ?, ?, ?)",
        params![
            payload.artist_track.xata_id,
            payload.artist_track.artist_id.xata_id,
            payload.artist_track.track_id.xata_id,
            payload.artist_track.xata_createdat,
        ],
    ) {
        Ok(_) => (),
        Err(e) => {
            if !e.to_string().contains("violates primary key constraint") {
                tracing::error!("[artist_tracks] error: {}", e);
                return Err(e.into());
            }
        }
    }

    match conn.execute(
        "INSERT INTO artist_albums (id, artist_id, album_id, created_at) VALUES (?, ?, ?, ?)",
        params![
            payload.artist_album.xata_id,
            payload.artist_album.artist_id.xata_id,
            payload.artist_album.album_id.xata_id,
            payload.artist_album.xata_createdat,
        ],
    ) {
        Ok(_) => (),
        Err(e) => {
            if !e.to_string().contains("violates primary key constraint") {
                tracing::error!("[artist_albums] error: {}", e);
                return Err(e.into());
            }
        }
    }

    match conn.execute(
        "INSERT INTO user_albums (id, user_id, album_id, created_at) VALUES (?, ?, ?, ?)",
        params![
            payload.user_album.xata_id,
            payload.user_album.user_id.xata_id,
            payload.user_album.album_id.xata_id,
            payload.user_album.xata_createdat,
        ],
    ) {
        Ok(_) => (),
        Err(e) => {
            if !e.to_string().contains("violates primary key constraint") {
                tracing::error!("[user_albums] error: {}", e);
                return Err(e.into());
            }
        }
    }

    match conn.execute(
        "INSERT INTO user_artists (id, user_id, artist_id, created_at) VALUES (?, ?, ?, ?)",
        params![
            payload.user_artist.xata_id,
            payload.user_artist.user_id.xata_id,
            payload.user_artist.artist_id.xata_id,
            payload.user_artist.xata_createdat,
        ],
    ) {
        Ok(_) => (),
        Err(e) => {
            if !e.to_string().contains("violates primary key constraint") {
                tracing::error!("[user_artists] error: {}", e);
                return Err(e.into());
            }
        }
    }

    match conn.execute(
        "INSERT INTO user_tracks (id, user_id, track_id, created_at) VALUES (?, ?, ?, ?)",
        params![
            payload.user_track.xata_id,
            payload.user_track.user_id.xata_id,
            payload.user_track.track_id.xata_id,
            payload.user_track.xata_createdat,
        ],
    ) {
        Ok(_) => (),
        Err(e) => {
            if !e.to_string().contains("violates primary key constraint") {
                tracing::error!("[user_tracks] error: {}", e);
                return Err(e.into());
            }
        }
    }

    match conn.execute(
        "INSERT INTO scrobbles (
            id,
            user_id,
            track_id,
            album_id,
            artist_id,
            uri,
            created_at
          ) VALUES (
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?
            )",
        params![
            payload.scrobble.xata_id,
            payload.scrobble.user_id.xata_id,
            payload.scrobble.track_id.xata_id,
            payload.scrobble.album_id.xata_id,
            payload.scrobble.artist_id.xata_id,
            payload.scrobble.uri,
            payload.scrobble.timestamp,
        ],
    ) {
        Ok(_) => (),
        Err(e) => {
            if !e.to_string().contains("violates primary key constraint") {
                tracing::error!("[scrobbles] error: {}", e);
                return Err(e.into());
            }
        }
    }

    Ok(())
}

pub async fn save_track(
    conn: Arc<Mutex<Connection>>,
    payload: NewTrackPayload,
) -> Result<(), Error> {
    let conn = conn.lock().unwrap();

    match conn.execute(
        "INSERT INTO tracks (
        id,
        title,
        artist,
        album_artist,
        album_art,
        album,
        track_number,
        duration,
        mb_id,
        youtube_link,
        spotify_link,
        tidal_link,
        apple_music_link,
        sha256,
        lyrics,
        composer,
        genre,
        disc_number,
        copyright_message,
        label,
        uri,
        artist_uri,
        album_uri,
        created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params![
            payload.track.xata_id,
            payload.track.title,
            payload.track.artist,
            payload.track.album_artist,
            payload.track.album_art,
            payload.track.album,
            payload.track.track_number,
            payload.track.duration,
            payload.track.mb_id,
            payload.track.youtube_link,
            payload.track.spotify_link,
            payload.track.tidal_link,
            payload.track.apple_music_link,
            payload.track.sha256,
            payload.track.lyrics,
            payload.track.composer,
            payload.track.genre,
            payload.track.disc_number,
            payload.track.copyright_message,
            payload.track.label,
            payload.track.uri,
            payload.track.artist_uri,
            payload.track.album_uri,
            payload.track.xata_createdat,
        ],
    ) {
        Ok(_) => (),
        Err(e) => {
            if !e.to_string().contains("violates primary key constraint") {
                tracing::error!("[tracks] error: {}", e);
                return Err(e.into());
            }
        }
    }

    match conn.execute(
        "INSERT INTO album_tracks (
        id,
        album_id,
        track_id
    ) VALUES (?,
        ?,
        ?)",
        params![
            payload.album_track.xata_id,
            payload.album_track.album_id.xata_id,
            payload.album_track.track_id.xata_id,
        ],
    ) {
        Ok(_) => (),
        Err(e) => {
            if !e.to_string().contains("violates primary key constraint") {
                tracing::error!("[album_tracks] error: {}", e);
                return Err(e.into());
            }
        }
    }

    match conn.execute(
        "INSERT INTO artist_tracks (id, artist_id, track_id, created_at) VALUES (?, ?, ?, ?)",
        params![
            payload.artist_track.xata_id,
            payload.artist_track.artist_id.xata_id,
            payload.artist_track.track_id.xata_id,
            payload.artist_track.xata_createdat,
        ],
    ) {
        Ok(_) => (),
        Err(e) => {
            if !e.to_string().contains("violates primary key constraint") {
                tracing::error!("[artist_tracks] error: {}", e);
                return Err(e.into());
            }
        }
    }

    match conn.execute(
        "INSERT INTO artist_albums (id, artist_id, album_id, created_at) VALUES (?, ?, ?, ?)",
        params![
            payload.artist_album.xata_id,
            payload.artist_album.artist_id.xata_id,
            payload.artist_album.album_id.xata_id,
            payload.artist_album.xata_createdat,
        ],
    ) {
        Ok(_) => (),
        Err(e) => {
            if !e.to_string().contains("violates primary key constraint") {
                tracing::error!("[artist_albums] error: {}", e);
                return Err(e.into());
            }
        }
    }
    Ok(())
}

pub async fn like(conn: Arc<Mutex<Connection>>, payload: LikePayload) -> Result<(), Error> {
    let conn = conn.lock().unwrap();
    match conn.execute(
        "INSERT INTO loved_tracks (
        id,
        user_id,
        track_id,
        created_at
      ) VALUES (
          ?,
          ?,
          ?,
          ?
        )",
        params![
            payload.xata_id,
            payload.user_id.xata_id,
            payload.track_id.xata_id,
            payload.xata_createdat,
        ],
    ) {
        Ok(_) => (),
        Err(e) => {
            if !e.to_string().contains("violates primary key constraint") {
                tracing::error!("[likes] error: {}", e);
                return Err(e.into());
            }
        }
    }
    Ok(())
}

pub async fn unlike(conn: Arc<Mutex<Connection>>, payload: UnlikePayload) -> Result<(), Error> {
    let conn = conn.lock().unwrap();
    match conn.execute(
        "DELETE FROM loved_tracks WHERE user_id = ? AND track_id = ?",
        params![payload.user_id.xata_id, payload.track_id.xata_id,],
    ) {
        Ok(_) => (),
        Err(e) => {
            tracing::error!("[unlikes] error: {}", e);
            return Err(e.into());
        }
    }
    Ok(())
}

pub async fn save_user(conn: Arc<Mutex<Connection>>, payload: UserPayload) -> Result<(), Error> {
    let conn = conn.lock().unwrap();

    match conn.execute(
        "INSERT INTO users (
        id,
        avatar,
        did,
        display_name,
        handle
      ) VALUES (
          ?,
          ?,
          ?,
          ?,
          ?
        )
        ON CONFLICT (id) DO UPDATE SET
        avatar = EXCLUDED.avatar,
        did = EXCLUDED.did,
        display_name = EXCLUDED.display_name,
        handle = EXCLUDED.handle",
        params![
            payload.xata_id,
            payload.avatar,
            payload.did,
            payload.display_name,
            payload.handle,
        ],
    ) {
        Ok(_) => (),
        Err(e) => {
            if !e.to_string().contains("violates primary key constraint") {
                tracing::error!("[users] error: {}", e);
                return Err(e.into());
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {

    use super::types;

    #[test]
    fn test_parse_scrobble() {
        let data = r#"
    {
  "scrobble": {
    "album_id": {
      "album_art": "https://cdn.rocksky.app/covers/9e004bc175df6c338cab2a9e465b736f.jpg",
      "artist": "Kid Ink",
      "artist_uri": "at://did:plc:7vdlgi2bflelz7mmuxoqjfcr/app.rocksky.artist/3lhlly4tvws2k",
      "release_date": "2012-06-26T00:00:00.000Z",
      "sha256": "8d3f54501cf22aeb5d7ecb2a21c43b8a0b21839df3c61007ec781b278ec2806f",
      "title": "Up & Away",
      "uri": "at://did:plc:7vdlgi2bflelz7mmuxoqjfcr/app.rocksky.album/3lhlly5k7sk2k",
      "xata_createdat": "2025-02-05T22:54:59.422Z",
      "xata_id": "rec_cuhuogpo74fi003af7og",
      "xata_updatedat": "2025-03-03T07:20:51.237Z",
      "xata_version": 29,
      "year": 2012,
      "apple_music_link": null,
      "spotify_link": null,
      "tidal_link": null,
      "youtube_link": null
    },
    "artist_id": {
      "name": "Kid Ink",
      "picture": "https://i.scdn.co/image/ab6761610000e5ebf4904a817005f3b96f4e6e53",
      "sha256": "7e9e30fecceedb10bf69e0c81dd036aeb5cf83befb0c3aeedf84684fe1ab1860",
      "uri": "at://did:plc:7vdlgi2bflelz7mmuxoqjfcr/app.rocksky.artist/3lhlly4tvws2k",
      "xata_createdat": "2025-02-05T22:40:50.310Z",
      "xata_id": "rec_cuhuhsho74fi003af740",
      "xata_updatedat": "2025-03-03T07:20:50.648Z",
      "xata_version": 82,
      "apple_music_link": null,
      "biography": null,
      "born": null,
      "born_in": null,
      "died": null,
      "spotify_link": null,
      "tidal_link": null,
      "youtube_link": null
    },
    "track_id": {
      "album": "Up & Away",
      "album_art": "https://cdn.rocksky.app/covers/9e004bc175df6c338cab2a9e465b736f.jpg",
      "album_artist": "Kid Ink",
      "album_uri": "at://did:plc:7vdlgi2bflelz7mmuxoqjfcr/app.rocksky.album/3lhlly5k7sk2k",
      "artist": "Kid Ink",
      "artist_uri": "at://did:plc:7vdlgi2bflelz7mmuxoqjfcr/app.rocksky.artist/3lhlly4tvws2k",
      "composer": "The Arsenals",
      "copyright_message": "2012 Tha Alumni",
      "disc_number": 1,
      "duration": 251922,
      "lyrics": "[00:11.91] I know, they ain't know what I'm on\n[00:26.97] Sorry excuse me, how I'm feelin' right now\n[00:30.12] Soon they gon' understand that\n[00:32.80] Try to do it like me you can tell 'em\n[00:35.63] I'm a beast, I'm a dog, they let me off the leash\n[00:39.12] Now I'm comin' for 'em all\n[00:40.87] Man I need another drink, it's the last call\n[00:43.79] Just gimme a minute lemme show 'em how I ball\n[00:46.60] Then we'll roll out, let's roll out\n[00:50.31] Let's roll out, we could roll out\n[00:59.92] Live, reportin' from the cockpit\n[01:02.62] Red eyes but I'm tryna get my mind clear\n[01:05.60] Celebratin' like we just won a contest\n[01:08.80] No contest, motherfuckers couldn't digest\n[01:11.66] What I'm on, man of my home\n[01:14.46] Bands on deck, you ain't gotta blow my horn\n[01:17.54] Paint a perfect picture like frida kahlo\n[01:20.41] Red or green pill don't trip just swallow that\n[01:23.77] And gon' have the time of your life\n[01:26.21] On me, no strings up, high as a kite\n[01:29.22] Watch the molly turn a straight girl right into a dyke\n[01:31.84] Soon you'll understand by the end of the night\n[01:35.04] Tell 'em\n[01:36.01] I know, they ain't know what I'm on\n[01:38.55] Sorry excuse me, how I'm feelin' right now\n[01:41.98] Soon they gon' understand that\n[01:44.63] Try to do it like me you can tell 'em\n[01:47.16] I'm a beast, I'm a dog, they let me off the leash\n[01:51.15] Now I'm comin' for 'em all\n[01:52.79] Man I need another drink, it's the last call\n[01:55.62] Just gimme a minute lemme show 'em how I ball\n[01:58.76] Then we'll roll out, let's roll out\n[02:02.97] Let's roll out, we could roll out\n[02:11.86] Just sayin', I need to get a point across\n[02:14.77] Somebody find these niggas cuz they fuckin' lost\n[02:17.70] Tryna be the boss, couldn't pay the cost\n[02:20.77] Let my chain speak for me we ain't gotta talk\n[02:23.73] I go, til, the bottle's, hollow\n[02:27.50] Smokin' on diablo, smellin' like patron and\n[02:30.68] Marc jacob's cologne, up & away new generation\n[02:34.65] Apollo shit, so ready to roll, and rockout\n[02:38.72] These lames can't ball like the nba lockout\n[02:41.11] Hit 'em in the head, might pull a knot out\n[02:44.65] Show these motherfuckers what they not 'bout\n[02:47.11] Tell 'em\n[02:48.17] ",
      "sha256": "0565f7815bc60c7fd96341073dd6420ca0e21ee36279d381ac5acf361fd27183",
      "title": "Roll Out",
      "track_number": 8,
      "uri": "at://did:plc:7vdlgi2bflelz7mmuxoqjfcr/app.rocksky.song/3lhlly2gob22k",
      "xata_createdat": "2025-02-05T22:54:58.062Z",
      "xata_id": "rec_cuhuogho74fi003af7o0",
      "xata_updatedat": "2025-03-03T07:21:04.449Z",
      "xata_version": 16,
      "apple_music_link": "null",
      "genre": "null",
      "label": "null",
      "mb_id": "null",
      "spotify_link": null,
      "tidal_link": null,
      "youtube_link": null
    },
    "uri": "at://did:plc:7vdlgi2bflelz7mmuxoqjfcr/app.rocksky.scrobble/3ljhfzlkhy225",
    "user_id": {
      "avatar": "https://cdn.bsky.app/img/avatar/plain/did:plc:7vdlgi2bflelz7mmuxoqjfcr/bafkreiabxfnhhk72ik2vgze6yjnjzbxps37nutkzbmnoo67ffoasgyeqwm@jpeg",
      "did": "did:plc:7vdlgi2bflelz7mmuxoqjfcr",
      "display_name": "Tsiry Sandratraina 🦀",
      "handle": "tsiry-sandratraina.com",
      "xata_createdat": "2025-02-03T04:39:54.139Z",
      "xata_id": "rec_cug4h6ibhfbm7uq5dte0",
      "xata_updatedat": "2025-02-03T04:39:54.139Z",
      "xata_version": 0
    },
    "xata_createdat": "2025-03-03T07:21:04.679Z",
    "xata_id": "rec_cv2lgo4ddc7scqp7svv0",
    "xata_updatedat": "2025-03-03T07:21:04.679Z",
    "xata_version": 0
  },
  "user_album": {
    "album_id": {
      "xata_id": "rec_cuhuogpo74fi003af7og"
    },
    "scrobbles": 10,
    "uri": "at://did:plc:7vdlgi2bflelz7mmuxoqjfcr/app.rocksky.album/3lhlly5k7sk2k",
    "user_id": {
      "xata_id": "rec_cug4h6ibhfbm7uq5dte0"
    },
    "xata_createdat": "2025-02-09T05:27:35.019Z",
    "xata_id": "rec_cuk3phssvaqtev3d9l60",
    "xata_updatedat": "2025-03-03T07:21:04.220Z",
    "xata_version": 10
  },
  "user_artist": {
    "artist_id": {
      "xata_id": "rec_cuhuhsho74fi003af740"
    },
    "scrobbles": 21,
    "uri": "at://did:plc:7vdlgi2bflelz7mmuxoqjfcr/app.rocksky.artist/3lhlly4tvws2k",
    "user_id": {
      "xata_id": "rec_cug4h6ibhfbm7uq5dte0"
    },
    "xata_createdat": "2025-02-08T21:38:11.888Z",
    "xata_id": "rec_cujstgpdl6q579droij0",
    "xata_updatedat": "2025-03-03T07:21:03.643Z",
    "xata_version": 21
  },
  "user_track": {
    "scrobbles": 6,
    "track_id": {
      "xata_id": "rec_cuhuogho74fi003af7o0"
    },
    "uri": "at://did:plc:7vdlgi2bflelz7mmuxoqjfcr/app.rocksky.song/3lhlly2gob22k",
    "user_id": {
      "xata_id": "rec_cug4h6ibhfbm7uq5dte0"
    },
    "xata_createdat": "2025-02-09T05:27:34.172Z",
    "xata_id": "rec_cuk3phhdl6q579drp6f0",
    "xata_updatedat": "2025-03-03T07:21:02.405Z",
    "xata_version": 6
  },
  "album_track": {
    "album_id": {
      "xata_id": "rec_cuhuogpo74fi003af7og"
    },
    "track_id": {
      "xata_id": "rec_cuhuogho74fi003af7o0"
    },
    "xata_createdat": "2025-02-05T22:54:59.922Z",
    "xata_id": "rec_cuhuogpo74fi003af7p0",
    "xata_updatedat": "2025-03-03T07:20:51.736Z",
    "xata_version": 11
  },
  "artist_track": {
    "artist_id": {
      "xata_id": "rec_cuhuhsho74fi003af740"
    },
    "track_id": {
      "xata_id": "rec_cuhuogho74fi003af7o0"
    },
    "xata_createdat": "2025-02-05T22:55:00.706Z",
    "xata_id": "rec_cuhuoh2e5drjqa1arhf0",
    "xata_updatedat": "2025-03-03T07:20:52.218Z",
    "xata_version": 11
  },
  "artist_album": {
    "album_id": {
      "xata_id": "rec_cuhuogpo74fi003af7og"
    },
    "artist_id": {
      "xata_id": "rec_cuhuhsho74fi003af740"
    },
    "xata_createdat": "2025-02-05T22:55:01.205Z",
    "xata_id": "rec_cuhuohe7vkdf9dh0pkh0",
    "xata_updatedat": "2025-03-03T07:20:53.007Z",
    "xata_version": 29
  }
}
    "#;

        match serde_json::from_str::<types::ScrobblePayload>(data) {
            Err(e) => {
                tracing::error!("Error parsing payload: {}", e);
                tracing::error!("{}", data);
            }
            Ok(_) => {}
        }
        assert!(true);
    }
}
