//! Watches position/index across a TRACK BOUNDARY, through the app's actual
//! Engine (live snapshot + boundary smoother) — the case the position probe
//! never covered.
//!
//! The raw pathology this guards against, measured before the smoother: with
//! a 10s decode-ahead buffer, `Player::status()` flips to the next track at
//! DECODE time — a 15s track "ended" at wall 5.0s, position collapsing from
//! 5032ms to 0. Through the smoother, the flip must happen at the audible
//! boundary with no backwards motion before it.
//!
//! Run: cargo run --example boundary_probe -- <file1> <file2>

use std::time::{Duration, Instant};

use rocksky_desktop_lib::engine::{Engine, EngineCmd};

fn main() {
    let a = std::env::args().nth(1).expect("file1");
    let b = std::env::args().nth(2).expect("file2");
    let engine = Engine::start().expect("audio engine");
    engine.send(EngineCmd::SetQueue {
        paths: vec![a, b],
        autoplay: true,
    });

    let start = Instant::now();
    let mut prev_pos: i64 = -1;
    let mut prev_idx: i64 = -1;
    let mut anomalies = 0usize;
    while start.elapsed() < Duration::from_secs(30) {
        std::thread::sleep(Duration::from_millis(250));
        let s = engine.snapshot().status;
        let pos = s.position.as_millis() as i64;
        let idx = s.index.map(|i| i as i64).unwrap_or(-1);
        let wall = start.elapsed().as_millis();
        if prev_idx >= 0 && idx != prev_idx {
            println!("{wall}ms INDEX {prev_idx}->{idx} at pos {pos}");
        }
        if prev_pos >= 0 && pos < prev_pos - 400 && idx == prev_idx {
            println!("{wall}ms BACKWARDS {prev_pos}->{pos} SAME TRACK");
            anomalies += 1;
        }
        prev_pos = pos;
        prev_idx = idx;
    }
    println!("done: {anomalies} backwards anomalies");
}
