//! Subsonic `download`. Unlike `stream`, which 302s to the object store, this
//! serves the bytes itself so it can set `Content-Disposition` — a redirect
//! loses the header, and the storage origin sends no CORS headers, so a browser
//! can neither rename the file nor fetch it.
//!
//! `id` may address a track, an album or a playlist; the latter two come back
//! as a zip.

use actix_web::HttpResponse;
use anyhow::Error;
use sqlx::{Pool, Postgres};
use std::io::{Cursor, Write};
use std::sync::Arc;
use zip::write::SimpleFileOptions;

use crate::handlers::albums::mime_to_suffix;
use crate::handlers::stream::resolve_track_url;
use crate::xata::track::TrackWithUpload;
use crate::{repo, response};

/// Strips what Windows, macOS and zip readers variously choke on.
fn safe_component(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect();
    let trimmed = cleaned.trim().trim_matches('.').to_string();
    if trimmed.is_empty() {
        "untitled".to_string()
    } else {
        trimmed
    }
}

fn track_filename(track: &TrackWithUpload) -> String {
    let suffix = mime_to_suffix(&track.mime_type);
    match track.track_number {
        Some(n) => format!(
            "{:02} {} - {}.{}",
            n,
            safe_component(&track.artist),
            safe_component(&track.title),
            suffix
        ),
        None => format!(
            "{} - {}.{}",
            safe_component(&track.artist),
            safe_component(&track.title),
            suffix
        ),
    }
}

async fn fetch_bytes(track: &TrackWithUpload) -> Result<Vec<u8>, Error> {
    let url = resolve_track_url(track).await?;
    let res = reqwest::get(&url).await?;
    if !res.status().is_success() {
        return Err(Error::msg(format!(
            "object store returned {} for {}",
            res.status(),
            track.r2_key
        )));
    }
    Ok(res.bytes().await?.to_vec())
}

fn attachment(filename: &str, content_type: &str, body: Vec<u8>) -> HttpResponse {
    HttpResponse::Ok()
        .content_type(content_type)
        .append_header((
            "Content-Disposition",
            // The unquoted form is for clients that ignore RFC 5987; filename*
            // carries the real, UTF-8 name.
            format!(
                "attachment; filename=\"{}\"; filename*=UTF-8''{}",
                filename.replace('"', ""),
                urlencoding_encode(filename)
            ),
        ))
        .append_header(("Access-Control-Allow-Origin", "*"))
        .append_header(("Cache-Control", "no-store"))
        .body(body)
}

/// Percent-encodes everything outside the RFC 5987 `attr-char` set.
fn urlencoding_encode(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for b in value.as_bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                out.push(*b as char)
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

/// Zips the tracks with no compression: audio is already compressed, so
/// deflating burns CPU for a percent or two.
async fn zip_tracks(name: &str, tracks: &[TrackWithUpload]) -> Result<HttpResponse, Error> {
    if tracks.is_empty() {
        return Err(Error::msg("nothing to download"));
    }

    let mut buf = Cursor::new(Vec::<u8>::new());
    {
        let mut zip = zip::ZipWriter::new(&mut buf);
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);

        let mut used: Vec<String> = Vec::new();
        for track in tracks {
            let bytes = match fetch_bytes(track).await {
                Ok(b) => b,
                Err(e) => {
                    // One unreadable object shouldn't cost the whole album.
                    tracing::error!("download: skipping {}: {}", track.r2_key, e);
                    continue;
                }
            };

            // Two tracks can share a name; a zip with duplicate entries extracts
            // to a single file.
            let mut filename = track_filename(track);
            let mut n = 2;
            while used.contains(&filename) {
                let base = track_filename(track);
                let (stem, ext) = base.rsplit_once('.').unwrap_or((base.as_str(), ""));
                filename = format!("{} ({}).{}", stem, n, ext);
                n += 1;
            }
            used.push(filename.clone());

            zip.start_file(&filename, options)?;
            zip.write_all(&bytes)?;
        }
        zip.finish()?;
    }

    Ok(attachment(
        &format!("{}.zip", safe_component(name)),
        "application/zip",
        buf.into_inner(),
    ))
}

pub async fn handle(
    format: &str,
    user_id: &str,
    id: &str,
    pool: &Arc<Pool<Postgres>>,
) -> HttpResponse {
    // A single track first: the common case, and the id spaces don't overlap.
    match repo::track::get_track_by_id(pool, id, user_id).await {
        Ok(Some(track)) => {
            return match fetch_bytes(&track).await {
                Ok(bytes) => {
                    let content_type = track.mime_type.clone();
                    attachment(&track_filename(&track), &content_type, bytes)
                }
                Err(e) => {
                    tracing::error!("download track error: {}", e);
                    response::err(format, 0, "Failed to download track")
                }
            };
        }
        Ok(None) => {}
        Err(e) => {
            tracing::error!("download track lookup error: {}", e);
            return response::err(format, 0, "Internal server error");
        }
    }

    match repo::track::get_tracks_by_album(pool, id, user_id).await {
        Ok(tracks) if !tracks.is_empty() => {
            let name = tracks
                .first()
                .map(|t| format!("{} - {}", t.album_artist, t.album))
                .unwrap_or_else(|| "album".to_string());
            return match zip_tracks(&name, &tracks).await {
                Ok(res) => res,
                Err(e) => {
                    tracing::error!("download album error: {}", e);
                    response::err(format, 0, "Failed to download album")
                }
            };
        }
        Ok(_) => {}
        Err(e) => {
            tracing::error!("download album lookup error: {}", e);
            return response::err(format, 0, "Internal server error");
        }
    }

    match repo::playlist::get_playlist(pool, id, user_id).await {
        Ok(Some((playlist, tracks))) => match zip_tracks(&playlist.name, &tracks).await {
            Ok(res) => res,
            Err(e) => {
                tracing::error!("download playlist error: {}", e);
                response::err(format, 0, "Failed to download playlist")
            }
        },
        Ok(None) => response::err(format, 70, "Nothing to download for that id"),
        Err(e) => {
            tracing::error!("download playlist lookup error: {}", e);
            response::err(format, 0, "Internal server error")
        }
    }
}
