use std::env;

use anyhow::Error;
use redis::Client;
use sqlx::{Pool, Postgres};

use crate::{clients::spotify::SpotifyClient, crypto::decrypt_aes_256_ctr, repo};

pub async fn start(pool: Pool<Postgres>, _client: Client) -> Result<(), Error> {
    let max = env::var("MAX_USERS")
        .unwrap_or("500".into())
        .parse::<u32>()
        .unwrap_or(500);
    let offset = env::var("OFFSET_USERS")
        .unwrap_or("0".into())
        .parse::<u32>()
        .unwrap_or(0);
    let users = repo::spotify_token::list(&pool, offset, max).await?;
    for user in users {
        let refresh_token = decrypt_aes_256_ctr(
            &user.refresh_token,
            &hex::decode(env::var("SPOTIFY_ENCRYPTION_KEY")?)?,
        )?;
        let mut spotify = SpotifyClient::new(&refresh_token);
        spotify.get_access_token().await?;

        let tracks = spotify.get_user_saved_tracks(0, 20, None).await?;
        println!("Spotify user tracks: \n {:#?}", tracks);
    }
    Ok(())
}
