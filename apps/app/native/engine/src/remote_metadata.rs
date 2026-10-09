//! Bounded background metadata reads. Never persist credentialed stream URLs.
use serde_json::Value;
use std::{
    fs::File,
    io::{Read, Seek, SeekFrom, Write},
    path::Path,
    time::Duration,
};
fn client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|_| "Metadata network unavailable".into())
}
pub fn artwork(url: &str, path: &Path) -> Result<(), String> {
    let response = client()?
        .get(url)
        .send()
        .and_then(|r| r.error_for_status())
        .map_err(|_| "Artwork unavailable")?;
    let mime = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if !mime.starts_with("image/") {
        return Err("Not an image".into());
    }
    let mut bytes = Vec::new();
    response
        .take(20 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Could not read artwork")?;
    if bytes.len() > 20 * 1024 * 1024 || bytes.is_empty() {
        return Err("Artwork too large or empty".into());
    }
    std::fs::write(path, bytes).map_err(|_| "Could not cache artwork".into())
}
pub fn read(url: &str, cache: &Path, art: &Path) -> Result<Value, String> {
    const HEAD: u64 = 8 * 1024 * 1024;
    const TAIL: u64 = 2 * 1024 * 1024;
    let client = client()?;
    let response = client
        .get(url)
        .header("Range", format!("bytes=0-{}", HEAD - 1))
        .send()
        .and_then(|r| r.error_for_status())
        .map_err(|_| "Track metadata unavailable")?;
    let total = if response.status().as_u16() == 206 {
        response
            .headers()
            .get("content-range")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.strip_prefix("bytes 0-"))
            .and_then(|s| s.split_once('/'))
            .and_then(|(_, size)| size.parse::<u64>().ok())
            .filter(|n| *n <= 8 * 1024 * 1024 * 1024)
    } else {
        None
    };
    let result = (|| {
        let mut file = File::create(cache).map_err(|_| "Could not create metadata buffer")?;
        let copied = std::io::copy(&mut response.take(HEAD), &mut file)
            .map_err(|_| "Could not read track tags")?;
        if let Some(total) = total.filter(|n| *n > copied) {
            file.set_len(total)
                .map_err(|_| "Could not size metadata buffer")?;
            let start = total.saturating_sub(TAIL).max(copied);
            if let Ok(mut tail) = client
                .get(url)
                .header("Range", format!("bytes={start}-{}", total - 1))
                .send()
            {
                let expected = format!("bytes {start}-");
                if tail.status().as_u16() == 206
                    && tail
                        .headers()
                        .get("content-range")
                        .and_then(|v| v.to_str().ok())
                        .is_some_and(|s| s.starts_with(&expected))
                {
                    file.seek(SeekFrom::Start(start))
                        .map_err(|_| "Could not seek metadata buffer")?;
                    std::io::copy(&mut (&mut tail).take(TAIL), &mut file)
                        .map_err(|_| "Could not read trailing tags")?;
                }
            }
        }
        file.flush()
            .map_err(|_| "Could not flush metadata buffer")?;
        crate::metadata::read(cache, art)
    })();
    let _ = std::fs::remove_file(cache);
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;
    #[test]
    fn reads_remote_tags_and_embedded_cover_then_removes_audio_buffer() {
        let bytes = std::fs::read(
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../../../../crates/audio/tests/fixtures/tagged.mp3"),
        )
        .unwrap();
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/stream", listener.local_addr().unwrap());
        let server = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            let mut request = [0; 4096];
            let n = socket.read(&mut request).unwrap();
            assert!(String::from_utf8_lossy(&request[..n])
                .to_lowercase()
                .contains("range: bytes=0-"));
            write!(socket,"HTTP/1.1 200 OK\r\nContent-Type: audio/mpeg\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",bytes.len()).unwrap();
            socket.write_all(&bytes).unwrap();
        });
        let dir = tempfile::tempdir().unwrap();
        let cache = dir.path().join("metadata.audio");
        let art = dir.path().join("cover.img");
        let metadata = read(&url, &cache, &art).unwrap();
        assert!(!metadata["title"].as_str().unwrap().is_empty());
        assert!(!metadata["artist"].as_str().unwrap().is_empty());
        assert!(art.is_file());
        assert!(!cache.exists());
        server.join().unwrap();
    }
}
