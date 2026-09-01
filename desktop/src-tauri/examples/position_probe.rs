//! Measures what `Player::status().position` actually does over time, so the
//! progress-bar jitter can be diagnosed from data instead of guessed at.
//!
//! Run: cargo run --example position_probe -- <audio-file>

use std::time::{Duration, Instant};

use rockbox_playback::{Player, PlayerConfig};

fn main() {
    let path = std::env::args()
        .nth(1)
        .expect("usage: position_probe <file>");
    let config = PlayerConfig::builder().buffer_seconds(10.0).build();
    let player = Player::with_config(config).expect("audio engine");

    player.set_queue([path.as_str()].into_iter());
    player.play();

    let start = Instant::now();
    let mut prev_ms: i64 = -1;
    let mut backwards = 0usize;
    let mut max_back_ms: i64 = 0;
    let mut samples = 0usize;

    println!("wall_ms,raw_pos_ms,delta_ms");
    while start.elapsed() < Duration::from_secs(12) {
        std::thread::sleep(Duration::from_millis(100));
        let s = player.status();
        let pos = s.position.as_millis() as i64;
        let wall = start.elapsed().as_millis() as i64;
        if prev_ms >= 0 {
            let delta = pos - prev_ms;
            println!("{wall},{pos},{delta}");
            if delta < 0 {
                backwards += 1;
                max_back_ms = max_back_ms.max(-delta);
            }
            samples += 1;
        }
        prev_ms = pos;
    }
    eprintln!("\nsamples={samples} backwards={backwards} worst_backward_jump={max_back_ms}ms");
}
