//! Capture the actual paced PCM output; never requires an audio device.
#![cfg(feature = "http")]

use rockbox_playback::{OutputConfig, PlaybackState, Player, PlayerConfig, SocketMode};
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpListener;
use std::time::{Duration, Instant};

fn tone(seconds: u32) -> Vec<u8> {
    let size = seconds * 44100 * 4;
    let mut wav = Vec::new();
    wav.extend(b"RIFF");
    wav.extend((36 + size).to_le_bytes());
    wav.extend(b"WAVEfmt ");
    wav.extend(16u32.to_le_bytes());
    wav.extend(1u16.to_le_bytes());
    wav.extend(2u16.to_le_bytes());
    wav.extend(44100u32.to_le_bytes());
    wav.extend(176400u32.to_le_bytes());
    wav.extend(4u16.to_le_bytes());
    wav.extend(16u16.to_le_bytes());
    wav.extend(b"data");
    wav.extend(size.to_le_bytes());
    for frame in 0..seconds * 44100 {
        let sample =
            (10000.0 * (frame as f64 * 440.0 * std::f64::consts::TAU / 44100.0).sin()) as i16;
        wav.extend(sample.to_le_bytes());
        wav.extend(sample.to_le_bytes());
    }
    wav
}

#[test]
fn slow_next_track_download_does_not_insert_silence() {
    // Both the seekable callback path and M4A's fully materialized cache path.
    for (body, content_type) in [
        (tone(1), "audio/wav"),
        (
            include_bytes!("fixtures/he-aac-tone.m4a").to_vec(),
            "audio/mp4",
        ),
    ] {
        let directory = tempfile::tempdir().unwrap();
        let first = directory.path().join("first.wav");
        let second = directory.path().join(if content_type == "audio/wav" {
            "second.wav"
        } else {
            "second.m4a"
        });
        std::fs::write(&first, tone(3)).unwrap();
        std::fs::write(&second, &body).unwrap();
        let http = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/next", http.local_addr().unwrap());
        let server = std::thread::spawn(move || {
            // Exactly one probe and one download. Close the listener after
            // these, so reopening at the transition cannot silently succeed.
            for request in 0..2 {
                let (mut stream, _) = http.accept().unwrap();
                let mut reader = BufReader::new(stream.try_clone().unwrap());
                let mut line = String::new();
                loop {
                    line.clear();
                    if reader.read_line(&mut line).unwrap() == 0 || line == "\r\n" {
                        break;
                    }
                }
                let data = if request == 0 { &body[..1] } else { &body[..] };
                if request == 1 {
                    // Longer than the entire output buffer: loading this at
                    // the boundary necessarily underruns without prefetch.
                    std::thread::sleep(Duration::from_millis(900));
                }
                write!(stream, "HTTP/1.1 206 Partial Content\r\nContent-Type: {content_type}\r\nContent-Range: bytes 0-{}/{}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", data.len() - 1, body.len(), data.len()).unwrap();
                stream.write_all(data).unwrap();
            }
        });
        let longest = capture_silence(first.clone(), url.into());
        server.join().unwrap();
        // The HE-AAC fixture contains codec priming silence even locally.
        // Network preparation must add no silence beyond the local result.
        let local = capture_silence(first, second);
        assert!(
            longest <= local + 2,
            "{content_type}: remote silence {longest} frames, local {local} frames"
        );
        if content_type == "audio/wav" {
            assert!(longest <= 2);
        }
    }
}

fn capture_silence(first: std::path::PathBuf, second: std::path::PathBuf) -> usize {
    let capture = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = capture.local_addr().unwrap().to_string();
    let recording = std::thread::spawn(move || {
        let (mut stream, _) = capture.accept().unwrap();
        let mut pcm = Vec::new();
        stream.read_to_end(&mut pcm).unwrap();
        pcm
    });
    let player = Player::with_config(PlayerConfig {
        output: OutputConfig::Tcp {
            addr,
            mode: SocketMode::Connect,
        },
        sample_rate: Some(44100),
        buffer_seconds: 0.5,
        ..Default::default()
    })
    .unwrap();
    player.set_queue(vec![first, second]);
    player.play();
    let deadline = Instant::now() + Duration::from_secs(15);
    let mut heard_second = false;
    loop {
        let status = player.status();
        heard_second |= status.index == Some(1);
        if heard_second && status.state == PlaybackState::Stopped {
            break;
        }
        assert!(
            Instant::now() < deadline,
            "queue did not finish both tracks"
        );
        std::thread::sleep(Duration::from_millis(10));
    }
    drop(player);
    let pcm = recording.join().unwrap();
    let frames: Vec<_> = pcm
        .chunks_exact(4)
        .map(|f| i16::from_le_bytes([f[0], f[1]]).unsigned_abs())
        .collect();
    let first = frames.iter().position(|&v| v > 100).unwrap();
    let last = frames.iter().rposition(|&v| v > 100).unwrap();
    let mut silence = 0;
    let mut longest = 0;
    for &sample in &frames[first..=last] {
        silence = if sample == 0 { silence + 1 } else { 0 };
        longest = longest.max(silence);
    }
    assert!(last - first > 3 * 44100, "incoming audio must be present");
    longest
}
