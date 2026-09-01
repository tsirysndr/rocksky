//! Measures the position through each read path the app has used, so changes
//! here are judged on data:
//!
//!  - cached: a snapshot refreshed on a ~250ms tick, polled at 500ms — the
//!            original path; staleness sweeps as the timers drift, so 500ms
//!            polls advance unevenly.
//!  - live:   a channel round-trip to the engine thread that computes
//!            `status()` at request time — the current path.
//!
//! Run: cargo run --example position_probe -- <audio-file>

use std::sync::mpsc::channel;
use std::time::{Duration, Instant};

use rockbox_playback::{Player, PlayerConfig};

enum Req {
    Get(std::sync::mpsc::Sender<Duration>),
}

fn main() {
    let path = std::env::args()
        .nth(1)
        .expect("usage: position_probe <file>");
    let (tx, rx) = channel::<Req>();

    // Engine thread: owns the Player, answers live reads, refreshes a cache —
    // the same loop shape as src/engine.rs.
    let cache = std::sync::Arc::new(std::sync::Mutex::new(Duration::ZERO));
    let shared = cache.clone();
    std::thread::spawn(move || {
        let config = PlayerConfig::builder().buffer_seconds(10.0).build();
        let player = Player::with_config(config).expect("audio engine");
        player.set_queue([path.as_str()].into_iter());
        player.play();
        loop {
            match rx.recv_timeout(Duration::from_millis(250)) {
                Ok(Req::Get(reply)) => {
                    let _ = reply.send(player.status().position);
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => return,
            }
            *shared.lock().unwrap() = player.status().position;
        }
    });

    std::thread::sleep(Duration::from_millis(1500)); // let playback start

    let mut prev_cached: i64 = -1;
    let mut prev_live: i64 = -1;
    let (mut c_min, mut c_max) = (i64::MAX, i64::MIN);
    let (mut l_min, mut l_max) = (i64::MAX, i64::MIN);
    let mut worst_rtt_us: u128 = 0;
    let start = Instant::now();
    while start.elapsed() < Duration::from_secs(15) {
        std::thread::sleep(Duration::from_millis(500));

        let cached = cache.lock().unwrap().as_millis() as i64;

        let t0 = Instant::now();
        let (rtx, rrx) = channel();
        tx.send(Req::Get(rtx)).unwrap();
        let live = rrx
            .recv_timeout(Duration::from_millis(100))
            .expect("engine thread answered")
            .as_millis() as i64;
        worst_rtt_us = worst_rtt_us.max(t0.elapsed().as_micros());

        if prev_cached >= 0 {
            let dc = cached - prev_cached;
            let dl = live - prev_live;
            c_min = c_min.min(dc);
            c_max = c_max.max(dc);
            l_min = l_min.min(dl);
            l_max = l_max.max(dl);
        }
        prev_cached = cached;
        prev_live = live;
    }
    println!(
        "cached reads: delta {c_min}..{c_max}ms (spread {}ms)",
        c_max - c_min
    );
    println!(
        "live reads:   delta {l_min}..{l_max}ms (spread {}ms)",
        l_max - l_min
    );
    println!("worst live round-trip: {worst_rtt_us}us");
}
