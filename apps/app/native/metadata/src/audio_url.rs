//! Validate external audio before queue mutation; cache tags/art, never URL credentials.
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Read, Seek, SeekFrom, Write},
    path::Path,
    time::Duration,
};
use symphonia::core::{
    codecs::DecoderOptions, formats::FormatOptions, io::MediaSourceStream, meta::MetadataOptions,
    probe::Hint,
};

/// Blocking: callers must use their native worker or spawn_blocking, never the UI thread.
pub fn prepare(input: &str, directory: &Path) -> Result<Value, String> {
    let mut url =
        reqwest::Url::parse(input.trim()).map_err(|_| "Enter a valid HTTP or HTTPS audio URL")?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
        return Err("Only HTTP and HTTPS audio URLs are supported".into());
    }
    url.set_fragment(None);
    fs::create_dir_all(directory).map_err(|_| "Could not create audio metadata cache")?;
    let client = reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|_| "Audio network unavailable")?;
    let mut response = client.get(url.clone()).header("Range", "bytes=0-8388607")
        .header("Icy-MetaData", "0").send().map_err(|error| {
            if error.is_timeout() {
                "This player could not reach the audio host/IP before the connection timed out".to_string()
            } else if error.is_connect() {
                "The audio host/IP is unreachable from this player, refused the connection, or could not be resolved".to_string()
            } else {
                "This player could not fetch the audio URL (network, TLS, or redirect error)".to_string()
            }
        })?;
    if !response.status().is_success() {
        return Err(format!(
            "Audio URL returned HTTP {}",
            response.status().as_u16()
        ));
    }
    let total = if response.status().as_u16() == 206 {
        let range = response
            .headers()
            .get("content-range")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        if !range.starts_with("bytes 0-") {
            return Err("Server returned an invalid audio byte range".into());
        }
        range
            .split_once('/')
            .and_then(|(_, n)| n.parse::<u64>().ok())
            .filter(|n| *n <= 8 * 1024 * 1024 * 1024)
    } else {
        None
    };
    let mime = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .split(';')
        .next()
        .unwrap_or("")
        .to_string();
    // Unknown-length/live streams need only a probe, not a full download.
    let limit = response
        .content_length()
        .map(|n| n.min(8 * 1024 * 1024))
        .unwrap_or(64 * 1024);
    let mut bytes = Vec::new();
    let read_result = (&mut response).take(limit).read_to_end(&mut bytes);
    if bytes.is_empty() {
        return Err("Audio URL returned no readable audio".into());
    }
    if read_result.is_err() && response.content_length().is_some() {
        return Err("Audio download was interrupted".into());
    }
    let mut fingerprint = Sha256::new();
    fingerprint.update(&bytes);
    fingerprint.update(total.unwrap_or(0).to_le_bytes());
    let mut buffer =
        tempfile::NamedTempFile::new_in(directory).map_err(|_| "Could not create audio probe")?;
    buffer
        .write_all(&bytes)
        .map_err(|_| "Could not write audio probe")?;
    if let Some(total) = total.filter(|n| *n > bytes.len() as u64) {
        buffer
            .as_file()
            .set_len(total)
            .map_err(|_| "Could not size audio probe")?;
        let start = total
            .saturating_sub(2 * 1024 * 1024)
            .max(bytes.len() as u64);
        if let Ok(mut tail) = client
            .get(url.clone())
            .header("Range", format!("bytes={start}-{}", total - 1))
            .send()
        {
            let expected = format!("bytes {start}-");
            if tail.status().as_u16() == 206
                && tail
                    .headers()
                    .get("content-range")
                    .and_then(|v| v.to_str().ok())
                    .is_some_and(|v| v.starts_with(&expected))
            {
                buffer
                    .seek(SeekFrom::Start(start))
                    .map_err(|_| "Could not seek audio probe")?;
                let mut tail_bytes = Vec::new();
                (&mut tail)
                    .take(2 * 1024 * 1024)
                    .read_to_end(&mut tail_bytes)
                    .map_err(|_| "Could not read trailing audio metadata")?;
                fingerprint.update(&tail_bytes);
                buffer
                    .write_all(&tail_bytes)
                    .map_err(|_| "Could not write audio probe")?;
            }
        }
    }
    buffer.flush().map_err(|_| "Could not flush audio probe")?;
    // Neither the extension nor Content-Type proves audio. Decode a real packet.
    let file = fs::File::open(buffer.path()).map_err(|_| "Could not open audio probe")?;
    let source = MediaSourceStream::new(Box::new(file), Default::default());
    let mut hint = Hint::new();
    if let Some(extension) = Path::new(url.path()).extension().and_then(|e| e.to_str()) {
        hint.with_extension(extension);
    }
    let mut probed = symphonia::default::get_probe()
        .format(
            &hint,
            source,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|_| "URL does not contain supported audio")?;
    let track = probed
        .format
        .tracks()
        .iter()
        .find(|t| {
            symphonia::default::get_codecs()
                .make(&t.codec_params, &DecoderOptions::default())
                .is_ok()
        })
        .ok_or("Audio codec is not supported")?;
    let track_id = track.id;
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|_| "Audio codec is not supported")?;
    let mut decoded = false;
    for _ in 0..128 {
        let Ok(packet) = probed.format.next_packet() else {
            break;
        };
        if packet.track_id() == track_id
            && decoder
                .decode(&packet)
                .is_ok_and(|audio| audio.frames() > 0)
        {
            decoded = true;
            break;
        }
    }
    if !decoded {
        return Err("URL contains no decodable audio, or its codec is unsupported".into());
    }
    let key = format!("{:x}", Sha256::digest(url.as_str().as_bytes()));
    let fingerprint = format!("{:x}", fingerprint.finalize());
    let cache_path = directory.join(format!("{key}.json"));
    // Reuse tags/art only after this target has fetched and decoded current audio.
    if let Ok(file) = fs::File::open(&cache_path) {
        if let Ok(mut cached) = serde_json::from_reader::<_, Value>(file) {
            if cached["probeFingerprint"].as_str() == Some(&fingerprint) {
                cached["url"] = json!(url.as_str());
                return Ok(cached);
            }
        }
    }
    // A unique temporary cover prevents stale or concurrent artwork from leaking into tags.
    let art = tempfile::NamedTempFile::new_in(directory).map_err(|_| "Could not cache artwork")?;
    let mut metadata =
        crate::metadata::read(buffer.path(), art.path()).unwrap_or_else(|_| json!({}));
    if metadata["title"].as_str().unwrap_or("").is_empty() {
        metadata["title"] = json!(url
            .path_segments()
            .and_then(|mut p| p.next_back())
            .filter(|s| !s.is_empty())
            .unwrap_or("Audio stream"));
    }
    metadata["cacheId"] = json!(key);
    metadata["mimeType"] = json!(mime);
    // A portable data URL works in native views, webviews and remote controllers.
    metadata["albumArt"] = Value::Null;
    if let Ok(cover) = fs::read(art.path()) {
        if !cover.is_empty() && cover.len() <= 512 * 1024 {
            use base64::Engine;
            let mime = if cover.starts_with(b"\x89PNG") {
                "image/png"
            } else if cover.starts_with(b"RIFF") {
                "image/webp"
            } else if cover.starts_with(b"GIF8") {
                "image/gif"
            } else {
                "image/jpeg"
            };
            metadata["albumArt"] = json!(format!(
                "data:{mime};base64,{}",
                base64::engine::general_purpose::STANDARD.encode(cover)
            ));
        }
    }
    metadata["probeFingerprint"] = json!(fingerprint);
    let mut cached =
        tempfile::NamedTempFile::new_in(directory).map_err(|_| "Could not cache audio metadata")?;
    serde_json::to_writer(&mut cached, &metadata).map_err(|_| "Could not cache audio metadata")?;
    cached
        .persist(directory.join(format!("{key}.json")))
        .map_err(|_| "Could not save audio metadata")?;
    metadata["url"] = json!(url.as_str());
    Ok(metadata)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;
    fn serve(status: &str, mime: &str, body: Vec<u8>) -> (String, std::thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!(
            "http://{}/audio?secret=keep-private",
            listener.local_addr().unwrap()
        );
        let status = status.to_owned();
        let mime = mime.to_owned();
        let handle = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            let mut request = [0; 4096];
            let _ = socket.read(&mut request);
            write!(socket, "HTTP/1.1 {status}\r\nContent-Type: {mime}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", body.len()).unwrap();
            let _ = socket.write_all(&body);
        });
        (url, handle)
    }
    #[test]
    fn rejects_http_errors_and_html_even_when_named_audio() {
        for (status, mime, body) in [
            ("404 Not Found", "audio/mpeg", b"missing".to_vec()),
            ("200 OK", "audio/mpeg", b"<html>not audio</html>".to_vec()),
            ("200 OK", "audio/wav", vec![]),
        ] {
            let (url, server) = serve(status, mime, body);
            let dir = tempfile::tempdir().unwrap();
            assert!(prepare(&url, dir.path()).is_err());
            assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 0);
            server.join().unwrap();
        }
    }
    #[test]
    fn extracts_and_caches_real_audio_without_persisting_url_credentials() {
        let bytes = fs::read(
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../../../../crates/audio/tests/fixtures/tagged.mp3"),
        )
        .unwrap();
        let (url, server) = serve("200 OK", "application/octet-stream", bytes);
        let dir = tempfile::tempdir().unwrap();
        let metadata = prepare(&url, dir.path()).unwrap();
        assert!(!metadata["title"].as_str().unwrap().is_empty());
        assert!(!metadata["artist"].as_str().unwrap().is_empty());
        assert!(metadata["albumArt"]
            .as_str()
            .unwrap()
            .starts_with("data:image/"));
        assert_eq!(metadata["url"], url);
        let cached = fs::read_to_string(
            dir.path()
                .join(format!("{}.json", metadata["cacheId"].as_str().unwrap())),
        )
        .unwrap();
        assert!(!cached.contains("keep-private"));
        assert!(serde_json::from_str::<Value>(&cached)
            .unwrap()
            .get("url")
            .is_none());
        server.join().unwrap();
    }
    #[test]
    fn rejects_unreachable_host_without_caching() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/audio", listener.local_addr().unwrap());
        drop(listener); // A known closed port: no external network dependency.
        let dir = tempfile::tempdir().unwrap();
        let error = prepare(&url, dir.path()).unwrap_err();
        assert!(
            error.contains("unreachable") || error.contains("timed out"),
            "{error}"
        );
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 0);
    }

    #[test]
    fn rejects_non_http_urls() {
        let dir = tempfile::tempdir().unwrap();
        for url in [
            "invalid",
            "file:///etc/passwd",
            "ftp://localhost/music.mp3",
            "javascript:alert(1)",
        ] {
            assert!(prepare(url, dir.path()).is_err());
        }
    }
}
