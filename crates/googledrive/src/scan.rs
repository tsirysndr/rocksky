use std::{env, io::Write, path::Path, sync::Arc};

use anyhow::Error;
use futures::future::BoxFuture;
use lofty::{file::TaggedFileExt, picture::{MimeType, Picture}, probe::Probe, tag::Accessor};
use owo_colors::OwoColorize;
use reqwest::{multipart, Client};
use sqlx::{Pool, Postgres};
use symphonia::core::{formats::FormatOptions, io::MediaSourceStream, meta::MetadataOptions, probe::Hint};
use tempfile::TempDir;

use crate::{client::{GoogleDriveClient, BASE_URL}, consts::AUDIO_EXTENSIONS, crypto::decrypt_aes_256_ctr, repo::{google_drive_path::create_google_drive_path, google_drive_token::find_google_drive_refresh_tokens, track::get_track_by_hash}, token::generate_token, types::file::{File, FileList}};

pub async fn scan_googledrive(pool: Arc<Pool<Postgres>>) -> Result<(), Error> {
  let refresh_tokens = find_google_drive_refresh_tokens(&pool).await?;
  for token in refresh_tokens {
    let refresh_token = decrypt_aes_256_ctr(
      &token.refresh_token,
      &hex::decode(env::var("SPOTIFY_ENCRYPTION_KEY")?)?
    )?;

    let client = GoogleDriveClient::new(&refresh_token).await?;
    let filelist = client.get_music_directory().await?;
    let music_dir = filelist.files.first().unwrap();
    let access_token = client.access_token.clone();
    scan_audio_files(
      pool.clone(),
      music_dir.id.clone(),
      access_token,
      token.did.clone(),
      token.xata_id.clone()
    ).await?;
  }
  Ok(())
}

pub fn scan_audio_files(
    pool: Arc<Pool<Postgres>>,
    file_id: String,
    access_token: String,
    did: String,
    google_drive_id: String,
) -> BoxFuture<'static, Result<(), Error>> {
  Box::pin(async move {
    let client = Client::new();
    let url = format!("{}/files/{}", BASE_URL, file_id);
    let res = client.get(&url)
      .bearer_auth(&access_token)
      .query(&[
        ("fields", "id, name, mimeType, parents"),
      ])
      .send()
      .await?;

    let file = res.json::<File>().await?;

    if file.mime_type == "application/vnd.google-apps.folder" {
      println!("Scanning folder: {}", file.name.bright_green());

      let url = format!("{}/files", BASE_URL);
      let res = client.get(&url)
        .bearer_auth(&access_token)
        .query(&[
          ("q", format!("'{}' in parents", file.id).as_str()),
          ("fields", "files(id, name, mimeType, parents)"),
          ("orderBy", "name"),
          ])
        .send()
        .await?;
      let filelist = res.json::<FileList>().await?;

      for file in filelist.files {
        scan_audio_files(
          pool.clone(),
          file.id,
          access_token.clone(),
          did.clone(),
          google_drive_id.clone()
        ).await?;
        tokio::time::sleep(std::time::Duration::from_secs(3)).await;
      }

      return Ok(());
    }

    if !AUDIO_EXTENSIONS
        .into_iter()
        .any(|ext| file.name.ends_with(&format!(".{}", ext)))
    {
        return Ok(());
    }

    println!("Downloading file: {}", file.name.bright_green());

    let client = Client::new();

    let url = format!("{}/files/{}", BASE_URL, file_id);
    let res = client.get(&url)
      .bearer_auth(&access_token)
      .query(&[
        ("alt", "media"),
        ])
      .send()
      .await?;

    let bytes = res.bytes().await?;

    let temp_dir = TempDir::new()?;
    let tmppath = temp_dir.path().join(&format!("{}", file.name));
    let mut tmpfile = std::fs::File::create(&tmppath)?;
    tmpfile.write_all(&bytes)?;

    println!("Reading file: {}", &tmppath.clone().display().to_string().bright_green());

    let tagged_file = match Probe::open(&tmppath)?.read()
    {
        Ok(tagged_file) => tagged_file,
        Err(e) => {
            println!("Error opening file: {}", e);
            return Ok(());
        }
    };

    let primary_tag = tagged_file.primary_tag();
    let tag = match primary_tag {
        Some(tag) => tag,
        None => {
            println!("No tag found in file");
            return Ok(());
        }
    };

    let pictures = tag.pictures();

    println!("Title: {}", tag.get_string(&lofty::tag::ItemKey::TrackTitle).unwrap_or_default().bright_green());
    println!("Artist: {}", tag.get_string(&lofty::tag::ItemKey::TrackArtist).unwrap_or_default().bright_green());
    println!("Album Artist: {}", tag.get_string(&lofty::tag::ItemKey::AlbumArtist).unwrap_or_default().bright_green());
    println!("Album: {}", tag.get_string(&lofty::tag::ItemKey::AlbumTitle).unwrap_or_default().bright_green());
    println!("Lyrics: {}", tag.get_string(&lofty::tag::ItemKey::Lyrics).unwrap_or_default().bright_green());
    println!("Year: {}", tag.year().unwrap_or_default().bright_green());
    println!("Track Number: {}", tag.track().unwrap_or_default().bright_green());
    println!("Track Total: {}", tag.track_total().unwrap_or_default().bright_green());
    println!("Release Date: {:?}", tag.get_string(&lofty::tag::ItemKey::OriginalReleaseDate).unwrap_or_default().bright_green());
    println!("Recording Date: {:?}", tag.get_string(&lofty::tag::ItemKey::RecordingDate).unwrap_or_default().bright_green());
    println!("Copyright Message: {}", tag.get_string(&lofty::tag::ItemKey::CopyrightMessage).unwrap_or_default().bright_green());
    println!("Pictures: {:?}", pictures);

    let title = tag.get_string(&lofty::tag::ItemKey::TrackTitle).unwrap_or_default();
    let artist = tag.get_string(&lofty::tag::ItemKey::TrackArtist).unwrap_or_default();
    let album_artist =  tag.get_string(&lofty::tag::ItemKey::AlbumArtist).unwrap_or_default();
    let album = tag.get_string(&lofty::tag::ItemKey::AlbumTitle).unwrap_or_default();
    let access_token = generate_token(&did)?;

    // check if track exists
    //
    // if not, create track
    // upload album artist
    //
    // link path to track

    let hash = sha256::digest(
      format!("{} - {} - {}", title, artist, album).to_lowercase(),
    );

    let track = get_track_by_hash(&pool, &hash).await?;
    let duration = get_track_duration(&tmppath).await?;
    let albumart_id = md5::compute(&format!("{} - {}", album_artist, album).to_lowercase());
    let albumart_id = format!("{:x}", albumart_id);

    match track {
      Some(track) => {
        println!("Track exists: {}", title.bright_green());
        create_google_drive_path(
          &pool,
          &file,
          &track,
          &google_drive_id,
        )
        .await?;
      },
      None => {
        println!("Creating track: {}", title.bright_green());

        let albumart = upload_album_cover(albumart_id.into(), pictures, &access_token).await?;

        let client = Client::new();
        const URL: &str = "https://api.rocksky.app/tracks";
        let response = client
          .post(URL)
          .header("Authorization", format!("Bearer {}", access_token))
          .json(&serde_json::json!({
              "title": tag.get_string(&lofty::tag::ItemKey::TrackTitle),
              "album": tag.get_string(&lofty::tag::ItemKey::AlbumTitle),
              "artist": tag.get_string(&lofty::tag::ItemKey::TrackArtist),
              "albumArtist": tag.get_string(&lofty::tag::ItemKey::AlbumArtist),
              "duration": duration,
              "trackNumber": tag.track(),
              "releaseDate": tag.get_string(&lofty::tag::ItemKey::OriginalReleaseDate).map(|date| match date.contains("-") {
                  true => Some(date),
                  false => None,
              }),
              "year": tag.year(),
              "discNumber": tag.disk(),
              "composer": tag.get_string(&lofty::tag::ItemKey::Composer),
              "albumArt": match albumart {
                  Some(albumart) => Some(format!("https://cdn.rocksky.app/covers/{}", albumart)),
                  None => None
              },
              "lyrics": tag.get_string(&lofty::tag::ItemKey::Lyrics),
              "copyrightMessage": tag.get_string(&lofty::tag::ItemKey::CopyrightMessage),
          }))
          .send()
          .await?;
        println!("Track Saved: {} {}", title, response.status());


        let track = get_track_by_hash(&pool, &hash).await?;
        if let Some(track) = track {
          let status = create_google_drive_path(
            &pool,
            &file,
            &track,
            &google_drive_id,
          )
          .await;

          println!("status: {:?}", status);

          return Ok(());
        }

        println!("Failed to create track: {}", title.bright_green());
      }
    }

    Ok(())
  })
}

pub async fn upload_album_cover(name: String, pictures: &[Picture], token: &str) -> Result<Option<String>, Error> {
  if pictures.is_empty() {
    return Ok(None);
  }

  let picture = &pictures[0];

  let buffer = match picture.mime_type() {
    Some(MimeType::Jpeg) =>  Some(picture.data().to_vec()),
    Some(MimeType::Png) => Some(picture.data().to_vec()),
    Some(MimeType::Gif) => Some(picture.data().to_vec()),
    Some(MimeType::Bmp) => Some(picture.data().to_vec()),
    Some(MimeType::Tiff) => Some(picture.data().to_vec()),
    _ => None
  };

  if buffer.is_none() {
    return Ok(None);
  }

  let buffer = buffer.unwrap();


  let ext = match picture.mime_type() {
    Some(MimeType::Jpeg) =>  "jpg",
    Some(MimeType::Png) => "png",
    Some(MimeType::Gif) => "gif",
    Some(MimeType::Bmp) => "bmp",
    Some(MimeType::Tiff) => "tiff",
    _ => {
      return Ok(None);
    }
  };

  let name = format!("{}.{}", name, ext);

  let part = multipart::Part::bytes(buffer).file_name(name.clone());
  let form = multipart::Form::new().part("file", part);
  let client = Client::new();

  const URL: &str = "https://uploads.rocksky.app";

  let response = client
      .post(URL)
      .header("Authorization", format!("Bearer {}", token))
      .multipart(form)
      .send()
      .await?;

  println!("Cover uploaded: {}", response.status());

  Ok(Some(name))
}

pub async fn get_track_duration(path: &Path) -> Result<u64, Error> {
  let duration = 0;
  let media_source = MediaSourceStream::new(Box::new(std::fs::File::open(path)?), Default::default());
  let mut hint = Hint::new();

  if let Some(extension) = path.extension() {
    if let Some(extension) = extension.to_str() {
     hint.with_extension(extension);
    }
  }


  let meta_opts = MetadataOptions::default();
  let format_opts = FormatOptions::default();

  let probed = match symphonia::default::get_probe().format(&hint, media_source, &format_opts, &meta_opts) {
    Ok(probed) => probed,
    Err(_) => {
      println!("Error probing file");
      return Ok(duration);
    },
  };

  if let Some(track) = probed.format.tracks().first() {
    if let Some(duration) = track.codec_params.n_frames {
        if let Some(sample_rate) = track.codec_params.sample_rate {
            return Ok((duration as f64 / sample_rate as f64) as u64 * 1000);
        }
    }
}
  Ok(duration)
}