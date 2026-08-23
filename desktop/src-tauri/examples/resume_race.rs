//! Repro of the resume flow: setQueue([resumed], autoplay) then insert
//! PlayLast(after) + Prepend(before) immediately — does the engine keep the
//! resumed track current, or fall back to queue slot 0?

use rockbox_playback::{InsertPosition, Player};
use std::time::Duration;

fn main() {
    let a = "https://download.samplelib.com/mp3/sample-3s.mp3"; // "before"
    let b = "https://download.samplelib.com/mp3/sample-9s.mp3"; // resumed
    let c = "https://download.samplelib.com/mp3/sample-6s.mp3"; // "after"

    let player = Player::new().expect("audio engine");
    player.set_queue([b]);
    player.play();
    player.insert_tracks([c], InsertPosition::InsertLast);
    player.insert_tracks([a], InsertPosition::Prepend);

    for i in 0..8 {
        std::thread::sleep(Duration::from_secs(1));
        let s = player.status();
        let q = player.queue();
        println!(
            "t={i}s state={:?} index={:?} queue={:?} dur={:?}",
            s.state,
            s.index,
            q.iter().map(|p| p.file_name().unwrap().to_string_lossy().into_owned()).collect::<Vec<_>>(),
            s.duration.as_secs(),
        );
    }
}
