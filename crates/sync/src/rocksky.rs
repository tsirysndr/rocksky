use anyhow::Error;

use crate::types::track::Track;

// const ROCKSKY_API: &str = "https://api.rocksky.app";

pub async fn scrobble(did: &str, track: Track, timestamp: u64) -> Result<(), Error> {
    // POST /now-playing
    Ok(())
}

pub async fn save_track(did: &str, track: Track) -> Result<(), Error> {
    // POST /tracks
    Ok(())
}
