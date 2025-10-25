use std::env;

use anyhow::Error;
use redis::Client;
use sqlx::{Pool, Postgres};

use crate::{clients::lastfm::LastFmClient, crypto::decrypt_aes_256_ctr, repo};

pub async fn start(pool: Pool<Postgres>, _client: Client) -> Result<(), Error> {
    let max = env::var("MAX_USERS")
        .unwrap_or("100".into())
        .parse::<u32>()
        .unwrap_or(100);
    let offset = env::var("OFFSET_USERS")
        .unwrap_or("0".into())
        .parse::<u32>()
        .unwrap_or(0);
    let users = repo::lastfm_token::list(&pool, offset, max).await?;
    for user in users {
        let session_key = decrypt_aes_256_ctr(
            &user.session_key,
            &hex::decode(env::var("SPOTIFY_ENCRYPTION_KEY")?)?,
        )?;
        let mut lastfm = LastFmClient::new(&session_key);
        lastfm.set_user(&user.user);
        let scrobbles = lastfm.get_recent_tracks(1, 1).await?;

        println!("Last.fm scrobbles: \n {:#?}", scrobbles);

        let loved_tracks = lastfm.get_loved_tracks(1, 1).await?;
        println!("Last.fm loved tracks: \n {:#?}", loved_tracks);
    }
    Ok(())
}
