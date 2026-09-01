//! Measures the position through the SAME read path the app uses — a cached
//! snapshot refreshed on a 250ms tick, polled on an independent 500ms timer —
//! with and without extrapolation to read time. The first probe version read
//! `player.status()` directly and (correctly) found it clean, which is exactly
//! why the cache staleness went unnoticed: the bug is in the read path, not
//! the engine.
//!
//! Run: cargo run --example position_probe -- <audio-file>

use std::sync::{Arc, Mutex};
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

    // The app's engine thread: refresh a shared snapshot every ~250ms.
    let cache: Arc<Mutex<(Duration, Instant)>> =
        Arc::new(Mutex::new((Duration::ZERO, Instant::now())));
    std::thread::sleep(Duration::from_millis(1200)); // let playback start

    let mut prev_raw: i64 = -1;
    let mut prev_ext: i64 = -1;
    let (mut raw_min, mut raw_max) = (i64::MAX, i64::MIN);
    let (mut ext_min, mut ext_max) = (i64::MAX, i64::MIN);
    let start = Instant::now();
    let mut next_refresh = Instant::now();
    let mut next_poll = Instant::now() + Duration::from_millis(500);
    while start.elapsed() < Duration::from_secs(20) {
        let now = Instant::now();
        if now >= next_refresh {
            *cache.lock().unwrap() = (player.status().position, Instant::now());
            next_refresh += Duration::from_millis(251); // drifts vs the 500ms poll
        }
        if now >= next_poll {
            let (pos, taken) = *cache.lock().unwrap();
            let raw = pos.as_millis() as i64;
            let ext = (pos + taken.elapsed()).as_millis() as i64;
            if prev_raw >= 0 {
                let dr = raw - prev_raw;
                let de = ext - prev_ext;
                raw_min = raw_min.min(dr);
                raw_max = raw_max.max(dr);
                ext_min = ext_min.min(de);
                ext_max = ext_max.max(de);
            }
            prev_raw = raw;
            prev_ext = ext;
            next_poll += Duration::from_millis(500);
        }
        std::thread::sleep(Duration::from_millis(5));
    }
    println!(
        "raw cached reads:   delta {raw_min}..{raw_max}ms (spread {}ms)",
        raw_max - raw_min
    );
    println!(
        "extrapolated reads: delta {ext_min}..{ext_max}ms (spread {}ms)",
        ext_max - ext_min
    );
}
