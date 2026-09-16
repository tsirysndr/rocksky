//! `POST /uploads/track` — adding a file to the library.
//!
//! The order of work matters, and it differs from `apps/api` in one deliberate
//! way.
//!
//! `apps/api` publishes the ATProto records first, then **polls the database
//! for up to 15 seconds** waiting for its own firehose indexer to write the
//! rows back, and fails the upload if they never arrive. That assumes an
//! indexer is always running. Here the sync source is optional — a self-hosted
//! instance may have no Tap configured at all — so this writes the catalogue
//! rows directly through [`crate::ingest`] and then publishes the records.
//!
//! That is not just faster, it removes the failure mode: the upload no longer
//! depends on a round trip through the network to complete. And because the
//! projection is idempotent and keyed on content hashes, the records coming
//! back through Tap later dedupe against the rows already written.
//!
//! So:
//!
//! 1. read the bytes, identify the container by its magic bytes
//! 2. read the tags, validate against what `app.rocksky.song` requires
//! 3. measure loudness and write ReplayGain tags, if the container takes them
//! 4. hash the stored bytes; reject a file already in this library
//! 5. project the catalogue rows locally (artist, album, track)
//! 6. publish the records to the user's repo and backfill the URIs
//! 7. store the cover art and the audio object
//! 8. insert the `user_uploads` row
//! 9. analyse key and BPM, without making anyone wait for it

use crate::atproto::{records, session};
use crate::auth::AuthDid;
use crate::db::{new_id, Backend};
use crate::error::{ResponseType, XrpcError, XrpcResult};
use crate::state::AppState;
use crate::storage;
use crate::uploads::audio;
use actix_multipart::Multipart;
use actix_web::web::{self, ServiceConfig};
use actix_web::HttpResponse;
use futures::StreamExt;
use serde::Serialize;

pub fn configure(cfg: &mut ServiceConfig) {
    cfg.route("/uploads/track", web::post().to(upload_track));
}

/// Largest file accepted, to bound what one request can allocate.
///
/// A lossless album side can be a few hundred megabytes, so this is generous;
/// the point is only that an unbounded stream cannot exhaust the process.
const MAX_FILE_BYTES: usize = 512 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadAccepted {
    pub upload_id: String,
    pub track_id: String,
    pub track: TrackSummary,
}

#[derive(Debug, Serialize)]
pub struct TrackSummary {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration: i64,
    pub genre: Option<String>,
}

/// What arrived in the multipart body.
struct Submitted {
    bytes: Vec<u8>,
    filename: String,
    storage_provider_id: Option<String>,
}

/// Reads the `file` part and the optional `storage_provider_id`.
async fn read_multipart(mut payload: Multipart) -> XrpcResult<Submitted> {
    let mut bytes: Option<Vec<u8>> = None;
    let mut filename = String::new();
    let mut storage_provider_id: Option<String> = None;

    while let Some(field) = payload.next().await {
        let mut field = field.map_err(|err| {
            XrpcError::invalid_request(format!("Invalid multipart form data: {err}"))
        })?;

        let name = field
            .content_disposition()
            .and_then(|disposition| disposition.get_name())
            .unwrap_or_default()
            .to_string();

        match name.as_str() {
            "file" => {
                filename = field
                    .content_disposition()
                    .and_then(|disposition| disposition.get_filename())
                    .unwrap_or("upload")
                    .to_string();

                let mut collected = Vec::new();
                while let Some(chunk) = field.next().await {
                    let chunk = chunk.map_err(|err| {
                        XrpcError::invalid_request(format!("Upload interrupted: {err}"))
                    })?;
                    if collected.len() + chunk.len() > MAX_FILE_BYTES {
                        return Err(XrpcError::with_message(
                            ResponseType::PayloadTooLarge,
                            "That file is too large.",
                        ));
                    }
                    collected.extend_from_slice(&chunk);
                }
                bytes = Some(collected);
            }
            "storage_provider_id" => {
                let mut value = Vec::new();
                while let Some(chunk) = field.next().await {
                    let chunk = chunk.map_err(|err| {
                        XrpcError::invalid_request(format!("Invalid form field: {err}"))
                    })?;
                    value.extend_from_slice(&chunk);
                }
                storage_provider_id = String::from_utf8(value)
                    .ok()
                    .map(|value| value.trim().to_string())
                    .filter(|value| !value.is_empty() && value != "null");
            }
            // Unknown parts are ignored rather than rejected: a browser may
            // add its own, and the contract names only these two.
            _ => {
                while field.next().await.is_some() {}
            }
        }
    }

    let bytes = bytes.ok_or_else(|| {
        XrpcError::invalid_request("No file provided").named("NO_FILE")
    })?;

    Ok(Submitted {
        bytes,
        filename,
        storage_provider_id,
    })
}

/// Turns an audio rejection into the error body the UI branches on.
fn rejected(rejection: audio::Rejection) -> XrpcError {
    let kind = match rejection {
        // Not audio at all is a bad request; tagged-but-incomplete is a
        // well-formed request this instance will not accept.
        audio::Rejection::InvalidFormat => ResponseType::InvalidRequest,
        _ => ResponseType::UnprocessableEntity,
    };
    let mut error =
        XrpcError::with_message(kind, rejection.message()).named(rejection.code());
    let missing = rejection.missing_fields();
    if !missing.is_empty() {
        error = error.missing_fields(missing);
    }
    error
}

async fn upload_track(
    state: web::Data<AppState>,
    auth: AuthDid,
    payload: Multipart,
) -> XrpcResult<HttpResponse> {
    let db = state.db();
    let user_id = caller_id(db, &auth.did).await?;

    let submitted = read_multipart(payload).await?;

    // The browser's Content-Type is whatever the OS guessed from the
    // filename, so the container is identified from the bytes.
    let mime = audio::detect_mime(&submitted.bytes)
        .ok_or_else(|| rejected(audio::Rejection::InvalidFormat))?;
    let extension = audio::extension_for(mime);

    // Tag reading needs a path: `rockbox-metadata` and `lofty` both work on
    // files, and ReplayGain tagging rewrites in place.
    let scratch = tempfile::tempdir()
        .map_err(|err| XrpcError::internal(anyhow::anyhow!(err)))?;
    let path = scratch.path().join(format!("upload.{extension}"));
    std::fs::write(&path, &submitted.bytes)
        .map_err(|err| XrpcError::internal(anyhow::anyhow!(err)))?;

    let tags = audio::read_tags(&path).map_err(|err| {
        tracing::info!(error = %err, "could not read tags from an upload");
        XrpcError::with_message(
            ResponseType::UnprocessableEntity,
            "Could not read audio tags from this file",
        )
        .named("METADATA_PARSE_FAILED")
    })?;

    audio::validate(&tags).map_err(rejected)?;

    // Loudness, so players can normalise. Rewrites the file in place, which is
    // why the hash below is taken from what is on disk rather than what
    // arrived.
    audio::ensure_replay_gain(&path, extension, tags.has_replay_gain);

    let stored = std::fs::read(&path).map_err(|err| XrpcError::internal(anyhow::anyhow!(err)))?;

    // Hash of the stored bytes, so two different files with the same tags do
    // not overwrite each other in the bucket.
    let content_hash = audio::content_hash(&stored);
    let storage_key = format!("music/{user_id}/{content_hash}.{extension}");

    let mut existing = db.sql("SELECT xata_id FROM user_uploads WHERE user_id = ");
    existing
        .bind(&user_id)
        .push(" AND r2_key = ")
        .bind(&storage_key)
        .push(" LIMIT 1");
    if let Some(upload_id) = db.fetch_scalar::<String>(&existing).await? {
        return Err(XrpcError::with_message(
            ResponseType::Conflict,
            format!("This exact file is already in your library ({upload_id})"),
        )
        .named("DUPLICATE_FILE"));
    }

    let album_artist = tags.album_artist().to_string();

    // Storage is resolved before anything is written, so a misconfigured
    // bucket fails before the catalogue has been touched.
    let target = storage::resolve(
        db,
        state.config().s3.as_ref(),
        state.storage_encryption_key(),
        &user_id,
        submitted.storage_provider_id.as_deref(),
    )
    .await
    .map_err(|err| match err {
        storage::StorageError::NotConfigured => XrpcError::not_configured("Object storage"),
        storage::StorageError::ProviderNotFound(_) => {
            XrpcError::invalid_request("That storage provider does not exist")
        }
        other => XrpcError::internal(anyhow::anyhow!(other)),
    })?;

    // Cover art first: the catalogue rows want its URL, and a failure here is
    // survivable — the track just carries the placeholder.
    //
    // The placeholder is substituted here rather than left NULL so the row and
    // the published record agree. The record parser does the same coercion, so
    // an upload and the same track arriving over the firehose produce the same
    // row.
    let album_art = match &tags.picture {
        Some((mime, data)) => store_cover(&state, mime, data, &album_artist, &tags.album).await,
        None => None,
    }
    .unwrap_or_else(|| crate::ingest::PLACEHOLDER_ALBUM_ART.to_string());

    // The catalogue rows, written locally rather than waited for. See the
    // module note.
    let song = crate::ingest::SongRecord {
        title: tags.title.clone(),
        artist: tags.artist.clone(),
        album: tags.album.clone(),
        album_artist: album_artist.clone(),
        duration: tags.duration_ms,
        created_at: chrono::Utc::now(),
        album_art: Some(album_art.clone()),
        track_number: tags.track_number,
        disc_number: Some(tags.disc()),
        year: tags.year,
        release_date: tags.release_date.clone(),
        genre: tags.genre.clone(),
        composer: tags.composer.clone(),
        lyrics: tags.lyrics.clone(),
        copyright_message: tags.copyright_message.clone(),
        label: tags.label.clone(),
        mb_id: tags.mb_id.clone(),
        isrc: tags.isrc.clone(),
        spotify_link: None,
        youtube_link: None,
        tidal_link: None,
        apple_music_link: None,
    };

    let track_id = crate::ingest::upsert_catalogue(db, &song)
        .await
        .map_err(|err| XrpcError::internal(anyhow::anyhow!(err)))?;

    // Publish to the user's repo, so the library is portable. Best effort: a
    // PDS that refuses the write leaves a local row that a later re-publish
    // or a firehose ingest can still fill in.
    publish_records(&state, &auth.did, &song, &track_id).await;

    // Then the audio itself.
    target
        .bucket
        .put_object_with_content_type(&storage_key, &stored, mime)
        .await
        .map_err(|err| {
            tracing::error!(error = %err, key = %storage_key, "could not store the audio");
            XrpcError::with_message(
                ResponseType::UpstreamFailure,
                storage::describe_failure(&err),
            )
        })?;

    let upload_id = new_id();
    let mut insert = db.sql(
        "INSERT INTO user_uploads \
         (xata_id, user_id, track_id, r2_key, mime_type, file_size, original_filename, \
          sample_rate, storage_provider_id) VALUES (",
    );
    insert
        .bind(&upload_id)
        .push(", ")
        .bind(&user_id)
        .push(", ")
        .bind(&track_id)
        .push(", ")
        .bind(&storage_key)
        .push(", ")
        .bind(mime)
        .push(", ")
        .bind(stored.len() as i64)
        .push(", ")
        .bind(&submitted.filename)
        .push(", ")
        .bind(tags.sample_rate)
        .push(", ")
        .bind(target.provider_id.clone())
        .push(")");
    db.execute(&insert).await?;

    tracing::info!(
        did = %auth.did,
        title = %tags.title,
        artist = %tags.artist,
        bytes = stored.len(),
        "stored an upload"
    );

    // Key and BPM, off the response path: it decodes the whole file, and an
    // analysis failure must never cost someone their upload.
    spawn_analysis(&state, stored, extension.to_string(), track_id.clone());

    Ok(HttpResponse::Ok().json(UploadAccepted {
        upload_id,
        track_id,
        track: TrackSummary {
            title: tags.title,
            artist: tags.artist,
            album: tags.album,
            duration: tags.duration_ms,
            genre: tags.genre,
        },
    }))
}

async fn caller_id(db: &Backend, did: &str) -> XrpcResult<String> {
    let mut sql = db.sql("SELECT xata_id FROM users WHERE did = ");
    sql.bind(did).push(" LIMIT 1");
    db.fetch_scalar::<String>(&sql)
        .await?
        .ok_or_else(|| XrpcError::auth_required("Unauthorized"))
}

/// Stores the embedded cover and returns its public URL.
///
/// Covers go to their own bucket under a content-independent name — the md5 of
/// "albumArtist - album" — so the same album uploaded twice, or scanned from a
/// cloud drive, reuses one object instead of duplicating it.
async fn store_cover(
    state: &AppState,
    mime: &str,
    data: &[u8],
    album_artist: &str,
    album: &str,
) -> Option<String> {
    let extension = audio::picture_extension(mime)?;
    let s3 = state.config().s3.as_ref()?;

    let key = format!("covers/{}.{extension}", audio::cover_id(album_artist, album));

    // The covers bucket is configured separately from the media bucket, and is
    // always the instance's own — a user's own bucket is for their audio.
    let bucket = match storage::covers_bucket(s3) {
        Ok(bucket) => bucket,
        Err(err) => {
            tracing::warn!(error = %err, "could not address the covers bucket");
            return None;
        }
    };

    match bucket.put_object_with_content_type(&key, data, mime).await {
        Ok(_) => Some(format!("{}/{key}", state.config().cdn_url.trim_end_matches('/'))),
        Err(err) => {
            // Survivable: the track carries the placeholder cover instead.
            tracing::warn!(error = %err, "could not store the album art");
            None
        }
    }
}

/// Publishes the song, album and artist records and backfills the URIs.
async fn publish_records(
    state: &AppState,
    did: &str,
    song: &crate::ingest::SongRecord,
    track_id: &str,
) {
    let Ok(Some(atp)) = session::load(state.auth_db(), did).await else {
        // No app-password session. An OAuth session needs a DPoP-signed write,
        // which this does not do yet, so the records are left unpublished
        // rather than written unsigned.
        tracing::info!(
            did,
            "no app-password session; the upload is local only and its records \
             were not published"
        );
        return;
    };

    let pds = match crate::atproto::resolve_pds(
        state.http(),
        &state.config().plc_directory_url,
        did,
    )
    .await
    {
        Ok(pds) => pds,
        Err(err) => {
            tracing::warn!(did, error = %err, "could not resolve the PDS to publish to");
            return;
        }
    };

    let record = records::TrackRecord {
        title: song.title.clone(),
        artist: song.artist.clone(),
        album: song.album.clone(),
        album_artist: song.album_artist.clone(),
        duration: song.duration,
        track_number: song.track_number,
        disc_number: song.disc_number,
        year: song.year,
        release_date: song.release_date.clone(),
        album_art: song.album_art.clone(),
        genre: song.genre.clone(),
        tags: song.genre.clone().map(|g| vec![g]).unwrap_or_default(),
        composer: song.composer.clone(),
        lyrics: song.lyrics.clone(),
        copyright_message: song.copyright_message.clone(),
        label: song.label.clone(),
        mb_id: song.mb_id.clone(),
        isrc: song.isrc.clone(),
        spotify_link: None,
        artist_picture: None,
    };

    // Whatever this repo already holds for the album and artist, so a second
    // track from the same album does not write a second album record.
    let known = records::KnownUris {
        album: crate::ingest::album_uri(state.db(), song).await.ok().flatten(),
        artist: crate::ingest::artist_uri(state.db(), &song.album_artist)
            .await
            .ok()
            .flatten(),
    };

    let uris = records::publish(state.http(), &pds, &atp, &record, &known).await;

    // Backfill whatever was published. `set_record_uri` only fills a NULL, so
    // a track that already had a URI keeps it.
    let db = state.db();
    if let Some(uri) = &uris.song {
        let _ = crate::ingest::set_record_uri(db, "tracks", track_id, uri).await;
    }
    if let Some(uri) = &uris.album {
        let _ = crate::ingest::set_album_uri(db, song, uri).await;
    }
    if let Some(uri) = &uris.artist {
        let _ = crate::ingest::set_artist_uri(db, &song.album_artist, uri).await;
    }
}

/// Runs key/BPM analysis on a blocking thread and stores what it finds.
fn spawn_analysis(state: &AppState, bytes: Vec<u8>, extension: String, track_id: String) {
    let state = state.clone();
    tokio::spawn(async move {
        // Analysis decodes the file and runs tempo and key detection, which is
        // CPU-bound and would otherwise stall the async runtime.
        let analysis =
            tokio::task::spawn_blocking(move || audio::analyze(&bytes, &extension)).await;

        let Ok(Some(analysis)) = analysis else {
            return;
        };

        if let Err(err) = crate::ingest::set_track_analysis(
            state.db(),
            &track_id,
            analysis.key.as_deref(),
            analysis.bpm.map(|bpm| bpm as f64),
        )
        .await
        {
            tracing::warn!(track_id, error = %err, "could not store the analysis");
            return;
        }

        tracing::info!(
            track_id,
            key = analysis.key.as_deref().unwrap_or("?"),
            bpm = analysis.bpm.map(|bpm| format!("{bpm:.1}")).unwrap_or_else(|| "?".into()),
            "analysed an upload"
        );
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use actix_web::{test, App};

    macro_rules! app {
        ($state:expr) => {
            test::init_service(
                App::new()
                    .app_data($state.clone())
                    .app_data(web::Data::new($state.clone()))
                    .configure(configure),
            )
            .await
        };
    }

    async fn signed_in() -> (AppState, String) {
        let state = AppState::for_test().await.unwrap();
        crate::ingest::upsert_user(state.db(), "did:plc:alice")
            .await
            .unwrap();
        let token =
            crate::rest::auth::mint_token(&state.config().jwt_secret, "did:plc:alice").unwrap();
        (state, token)
    }

    /// A multipart body with one `file` part.
    fn multipart_body(filename: &str, content: &[u8]) -> (Vec<u8>, String) {
        let boundary = "----rockskytestboundary";
        let mut body = Vec::new();
        body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
        body.extend_from_slice(
            format!(
                "Content-Disposition: form-data; name=\"file\"; filename=\"{filename}\"\r\n\
                 Content-Type: application/octet-stream\r\n\r\n"
            )
            .as_bytes(),
        );
        body.extend_from_slice(content);
        body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
        (body, format!("multipart/form-data; boundary={boundary}"))
    }

    #[actix_web::test]
    async fn uploading_requires_authentication() {
        let state = AppState::for_test().await.unwrap();
        let app = app!(state);
        let (body, content_type) = multipart_body("a.mp3", b"ID3\x04\x00\x00");

        let res = test::call_service(
            &app,
            test::TestRequest::post()
                .uri("/uploads/track")
                .insert_header(("content-type", content_type))
                .set_payload(body)
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 401);
    }

    #[actix_web::test]
    async fn a_request_with_no_file_is_rejected() {
        let (state, token) = signed_in().await;
        let app = app!(state);

        let boundary = "----b";
        let body = format!(
            "--{boundary}\r\nContent-Disposition: form-data; name=\"other\"\r\n\r\nx\r\n\
             --{boundary}--\r\n"
        );

        let res = test::call_service(
            &app,
            test::TestRequest::post()
                .uri("/uploads/track")
                .insert_header(("authorization", format!("Bearer {token}")))
                .insert_header((
                    "content-type",
                    format!("multipart/form-data; boundary={boundary}"),
                ))
                .set_payload(body)
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 400);
        let body: serde_json::Value = test::read_body_json(res).await;
        assert_eq!(body["error"], "NO_FILE");
    }

    /// A file whose bytes are not audio is refused whatever it is named.
    #[actix_web::test]
    async fn a_non_audio_file_is_refused() {
        let (state, token) = signed_in().await;
        let app = app!(state);
        // A JPEG, named .mp3.
        let (body, content_type) = multipart_body("song.mp3", &[0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

        let res = test::call_service(
            &app,
            test::TestRequest::post()
                .uri("/uploads/track")
                .insert_header(("authorization", format!("Bearer {token}")))
                .insert_header(("content-type", content_type))
                .set_payload(body)
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 400);
        let body: serde_json::Value = test::read_body_json(res).await;
        assert_eq!(body["error"], "INVALID_FORMAT");
        assert!(body["message"].as_str().unwrap().contains("MP3"));
    }

    /// Audio-shaped but unparseable: the tag read fails rather than the format
    /// check.
    #[actix_web::test]
    async fn an_unreadable_audio_file_reports_a_parse_failure() {
        let (state, token) = signed_in().await;
        let app = app!(state);
        // Starts with an ID3 header, so it passes format detection.
        let (body, content_type) =
            multipart_body("song.mp3", b"ID3\x04\x00\x00\x00\x00\x00\x00rubbish");

        let res = test::call_service(
            &app,
            test::TestRequest::post()
                .uri("/uploads/track")
                .insert_header(("authorization", format!("Bearer {token}")))
                .insert_header(("content-type", content_type))
                .set_payload(body)
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 422);
        let body: serde_json::Value = test::read_body_json(res).await;
        // Either the tags could not be read, or they were read and found
        // wanting — both are 422 and both name the fix.
        assert!(
            matches!(
                body["error"].as_str(),
                Some("METADATA_PARSE_FAILED") | Some("NO_TAGS") | Some("INCOMPLETE_METADATA")
            ),
            "{body}"
        );
        assert!(!state_has_uploads(&state).await, "nothing was stored");
    }

    async fn state_has_uploads(state: &AppState) -> bool {
        let db = state.db();
        db.count(&db.sql("SELECT count(*) FROM user_uploads"))
            .await
            .unwrap()
            > 0
    }

    #[actix_web::test]
    async fn an_unindexed_account_cannot_upload() {
        let state = AppState::for_test().await.unwrap();
        let token =
            crate::rest::auth::mint_token(&state.config().jwt_secret, "did:plc:stranger").unwrap();
        let app = app!(state);
        let (body, content_type) = multipart_body("a.mp3", b"ID3\x04\x00\x00");

        let res = test::call_service(
            &app,
            test::TestRequest::post()
                .uri("/uploads/track")
                .insert_header(("authorization", format!("Bearer {token}")))
                .insert_header(("content-type", content_type))
                .set_payload(body)
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 401);
    }
}
