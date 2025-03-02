use std::{env, sync::{Arc, Mutex}, thread};
use anyhow::Error;
use async_nats::{connect, Client};
use duckdb::{params, Connection};
use owo_colors::OwoColorize;
use tokio_stream::StreamExt;
use types::{LikePayload, NewTrackPayload, ScrobblePayload, UnlikePayload};

pub mod types;

pub async fn subscribe(conn: Arc<Mutex<Connection>>) -> Result<(), Error> {
    let addr = env::var("NATS_URL").unwrap_or_else(|_| "nats://localhost:4222".to_string());
    let conn = conn.clone();
    let nc = connect(&addr).await?;
    println!("Connected to NATS server at {}", addr.bright_green());

    let nc = Arc::new(Mutex::new(nc));
    on_scrobble(nc.clone(), conn.clone());
    on_new_track(nc.clone(), conn.clone());
    on_like(nc.clone(), conn.clone());
    on_unlike(nc.clone(), conn.clone());

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
          Ok(payload) => {
            match save_scrobble(conn.clone(), payload.clone()).await {
              Ok(_) => println!("Scrobble saved successfully for {}", payload.scrobble.uri.cyan()),
              Err(e) => eprintln!("Error saving scrobble: {}", e),
            }
          },
          Err(e) => {
            eprintln!("Error parsing payload: {}", e);
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
          Ok(payload) => {
            match save_track(conn.clone(), payload.clone()).await {
              Ok(_) => println!("Song saved successfully for {}", payload.track.title.cyan()),
              Err(e) => eprintln!("Error saving song: {}", e),
            }
          },
          Err(e) => {
            eprintln!("Error parsing payload: {}", e);
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
          Ok(payload) => {
            match like(conn.clone(), payload.clone()).await {
              Ok(_) => println!("Like saved successfully for {}", payload.track_id.xata_id.cyan()),
              Err(e) => eprintln!("Error saving like: {}", e),
            }
          },
          Err(e) => {
            eprintln!("Error parsing payload: {}", e);
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
          Ok(payload) => {
            match unlike(conn.clone(), payload.clone()).await {
              Ok(_) => println!("Unlike saved successfully for {}", payload.track_id.xata_id.cyan()),
              Err(e) => eprintln!("Error saving unlike: {}", e),
            }
          },
          Err(e) => {
            eprintln!("Error parsing payload: {}", e);
          }
        }
      }

      Ok::<(), Error>(())
    })?;

    Ok::<(), Error>(())
  });
}

pub async fn save_scrobble(conn: Arc<Mutex<Connection>>, payload: ScrobblePayload) -> Result<(), Error> {
    let conn = conn.lock().unwrap();

    match conn.execute(
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
          uri
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
                  println!("[artists] error: {}", e);
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
            println!("[albums] error: {}", e);
            return Err(e.into());
          }
        },
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
            println!("[tracks] error: {}", e);
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
            println!("[album_tracks] error: {}", e);
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
            println!("[artist_tracks] error: {}", e);
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
          println!("[artist_albums] error: {}", e);
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
            println!("[user_albums] error: {}", e);
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
            println!("[user_artists] error: {}", e);
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
            println!("[user_tracks] error: {}", e);
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
              payload.scrobble.xata_createdat,
          ],
      ) {
          Ok(_) => (),
          Err(e) => {
              if !e.to_string().contains("violates primary key constraint") {
                  println!("[scrobbles] error: {}", e);
                  return Err(e.into());
              }
          }
      }

    Ok(())
}

pub async fn save_track(conn: Arc<Mutex<Connection>>, payload: NewTrackPayload) -> Result<(), Error> {
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
          println!("[tracks] error: {}", e);
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
          println!("[album_tracks] error: {}", e);
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
          println!("[artist_tracks] error: {}", e);
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
        println!("[artist_albums] error: {}", e);
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
          println!("[user_albums] error: {}", e);
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
          println!("[user_artists] error: {}", e);
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
          println!("[user_tracks] error: {}", e);
          return Err(e.into());
        }
      }
  }

  Ok(())
}

pub async fn like(conn: Arc<Mutex<Connection>>, payload: LikePayload) -> Result<(), Error> {
  let conn = conn.lock().unwrap();
  match conn.execute(
    "INSERT INTO likes (
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
              println!("[likes] error: {}", e);
              return Err(e.into());
          }
      }
  }
  Ok(())
}

pub async fn unlike(conn: Arc<Mutex<Connection>>, payload: UnlikePayload) -> Result<(), Error> {
  let conn = conn.lock().unwrap();
  match conn.execute(
    "DELETE FROM likes WHERE user_id = ? AND track_id = ?",
    params![
        payload.user_id.xata_id,
        payload.track_id.xata_id,
    ],
  ) {
      Ok(_) => (),
      Err(e) => {
          println!("[unlikes] error: {}", e);
          return Err(e.into());
      }
  }
  Ok(())
}