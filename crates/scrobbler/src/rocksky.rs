use anyhow::Error;
use reqwest::Client;

use crate::{auth::generate_token, cache::Cache, response, types::Track};

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
  track.timestamp = Some(timestamp);

  let token = generate_token(did)?;
  let client = Client::new();

  println!("Scrobbling track: \n {:#?}", track);

  let response= client
    .post(&format!("{}/now-playing", ROCKSKY_API))
    .bearer_auth(token)
    .json(&track)
    .send()
    .await?;

  let status = response.status();
  println!("Response status: {}", status);
  if !status.is_success() {
    let response_text = response.text().await?;
    println!("did: {}", did);
    println!("Failed to scrobble track: {}", response_text);
    return Err(Error::msg(format!("Failed to scrobble track: {}", response_text)));
  }

  Ok(())
}
