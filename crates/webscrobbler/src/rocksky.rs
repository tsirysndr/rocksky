use anyhow::Error;
use reqwest::Client;

use crate::{auth::generate_token, cache::Cache, types::Track};

const ROCKSKY_API: &str = "https://api.rocksky.app";

pub async fn scrobble(cache: &Cache, did: &str, track: Track, timestamp: u64) -> Result<(), Error> {
  let key = format!("{} - {}", track.artist.to_lowercase(), track.title.to_lowercase());

  // Check if the track is already in the cache, if not add it
  if !cache.exists(&key)? {
    let value = serde_json::to_string(&track)?;
    let ttl =  15 * 60; // 15 minutes
    cache.setex(&key, &value, ttl)?;
  }

  let mut track = track;
  track.timestamp = Some(timestamp / 1000 as u64);

  let token = generate_token(did)?;
  let client = Client::new();

  println!("Scrobbling track: \n {:#?}", track);

  let response= client
    .post(&format!("{}/now-playing", ROCKSKY_API))
    .bearer_auth(token)
    .json(&track)
    .send()
    .await?;

  if !response.status().is_success() {
    return Err(Error::msg(format!("Failed to scrobble track: {}", response.text().await?)));
  }

  Ok(())
}
