//! Which track ends up current when we cue one track then insert the rest
//! around it (the app's "start at index" pattern), vs setting the full queue
//! and skipping? Prints the engine's index/duration so we can tell.
use rockbox_playback::{InsertPosition, PlaybackState, Player};
use std::time::Duration;

const A: &str = "https://download.samplelib.com/mp3/sample-3s.mp3";
const B: &str = "https://download.samplelib.com/mp3/sample-9s.mp3"; // target
const C: &str = "https://download.samplelib.com/mp3/sample-6s.mp3";

fn probe(label: &str, f: impl Fn(&Player)) {
    let player = Player::new().expect("engine");
    f(&player);
    for i in 0..7 {
        std::thread::sleep(Duration::from_secs(1));
        let s = player.status();
        if s.state != PlaybackState::Stopped && s.duration.as_secs() > 0 {
            println!("{label}: t={i}s index={:?} dur={}s (target dur=9s)", s.index, s.duration.as_secs());
            return;
        }
    }
    println!("{label}: never started");
}

fn main() {
    probe("cue+insert", |p| {
        p.set_queue([B]);
        p.play();
        p.insert_tracks([C], InsertPosition::InsertLast);
        p.insert_tracks([A], InsertPosition::Prepend);
    });
    probe("full+skip ", |p| {
        p.set_queue([A, B, C]);
        p.skip_to(1);
        p.play();
    });
}
