use std::{env, vec};

use anyhow::Error;
use sqlx::{Pool, Postgres};

use crate::{clients::tidal::TidalClient, repo, search::search_track};

pub async fn start(pool: Pool<Postgres>) -> Result<(), Error> {
    let max = env::var("MAX_USERS")
        .unwrap_or("500".into())
        .parse::<u32>()
        .unwrap_or(500);
    let offset = env::var("OFFSET_USERS")
        .unwrap_or("0".into())
        .parse::<u32>()
        .unwrap_or(0);
    let users = repo::tidal_token::list(&pool, offset, max).await?;
    for user in users {
        let refresh_token = crate::crypto::decrypt_aes_256_ctr(
            &user.refresh_token,
            &hex::decode(env::var("SPOTIFY_ENCRYPTION_KEY")?)?,
        )?;
        let mut tidal = TidalClient::new(&refresh_token);
        tidal.get_access_token().await?;
        let tracks = tidal.get_user_tracks().await?;
        let track_id = &tracks.data[0].id;
        println!("Tidal tracks[0]: \n {:#?}", tracks.included.unwrap()[0]);
        println!("Tidal total tracks: \n {}", tracks.data.len());

        let track = tidal.get_track(&track_id, "US").await?;
        tidal.get_tracks(vec![track_id], "US").await?;

        let included = track.included.unwrap();

        let album = included
            .iter()
            .find(|item| item.r#type == "albums")
            .unwrap();
        tidal.get_album(&album.id, "US").await?;

        let artist = included
            .iter()
            .find(|item| item.r#type == "artists")
            .unwrap();

        let title = &track.data.attributes.title;
        tidal.get_artist(&artist.id, "US").await?;

        let result = search_track(
            &pool,
            title,
            artist
                .attributes
                .name
                .as_ref()
                .unwrap_or(&String::default()),
        )
        .await?;

        if result.is_none() {
            tracing::warn!(
                title = %title,
                artist = %artist.attributes.name.as_ref().unwrap_or(&String::default()),
                "Track not found, skipping",
            );
            continue;
        }

        let (_song, xata_id) = result.unwrap();
        if let Some(xata_id) = &xata_id {
            repo::track::update_tidal_metadata(
                &pool,
                xata_id,
                &track.data.id,
                &track.data.attributes.external_links[0].href,
                &track
                    .data
                    .attributes
                    .isrc
                    .as_ref()
                    .unwrap_or(&String::default()),
            )
            .await?;
        }

        // save_track to Rocksky + loved tracks
    }
    Ok(())
}
