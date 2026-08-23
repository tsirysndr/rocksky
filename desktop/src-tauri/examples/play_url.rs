//! Standalone playback repro: `cargo run --example play_url -- <url-or-path>`.
//! Plays through the exact rockbox-playback feature set the app compiles with
//! and prints the engine status once a second.

use std::time::Duration;

fn main() {
    let url = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "https://download.samplelib.com/mp3/sample-9s.mp3".to_string());
    println!("playing: {url}");

    let player = rockbox_playback::Player::new().expect("audio engine");
    player.set_queue([url.as_str()]);
    player.play();

    for i in 0..12 {
        std::thread::sleep(Duration::from_secs(1));
        let s = player.status();
        println!(
            "t={i}s state={:?} pos={:?} dur={:?} queue={} meta={:?}",
            s.state,
            s.position,
            s.duration,
            s.queue_len,
            s.metadata.as_ref().map(|m| (&m.codec, m.sample_rate)),
        );
    }
}
