use anyhow::Error;
use sqlx::{Pool, Postgres};

use crate::xata::{
    artist::Artist, artist_album::ArtistAlbum, artist_track::ArtistTrack, user_artist::UserArtist,
};

pub async fn get_artists(
    pool: &Pool<Postgres>,
    offset: i64,
    limit: i64,
) -> Result<Vec<Artist>, Error> {
    let artists = sqlx::query_as::<_, Artist>("SELECT * FROM artists OFFSET $1 LIMIT $2")
        .bind(offset)
        .bind(limit)
        .fetch_all(pool)
        .await?;
    Ok(artists)
}

pub async fn insert_artist(pool: &Pool<Postgres>, artist: &Artist) -> Result<(), Error> {
    sqlx::query(
        r#"INSERT INTO artists (
        xata_id,
        name,
        biography,
        born,
        born_in,
        died,
        picture,
        sha256,
        spotify_link,
        tidal_link,
        youtube_link,
        apple_music_link,
        uri,
        genres,
        xata_createdat
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (xata_id) DO NOTHING"#,
    )
    .bind(&artist.xata_id)
    .bind(&artist.name)
    .bind(&artist.biography)
    .bind(&artist.born)
    .bind(&artist.born_in)
    .bind(&artist.died)
    .bind(&artist.picture)
    .bind(&artist.sha256)
    .bind(&artist.spotify_link)
    .bind(&artist.tidal_link)
    .bind(&artist.youtube_link)
    .bind(&artist.apple_music_link)
    .bind(&artist.uri)
    .bind(&artist.genres)
    .bind(artist.xata_createdat)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_artist_albums(
    pool: &Pool<Postgres>,
    offset: i64,
    limit: i64,
) -> Result<Vec<ArtistAlbum>, Error> {
    let artist_albums =
        sqlx::query_as::<_, ArtistAlbum>("SELECT * FROM artist_albums OFFSET $1 LIMIT $2")
            .bind(offset)
            .bind(limit)
            .fetch_all(pool)
            .await?;
    Ok(artist_albums)
}

pub async fn get_artist_tracks(
    pool: &Pool<Postgres>,
    offset: i64,
    limit: i64,
) -> Result<Vec<ArtistTrack>, Error> {
    let artist_tracks =
        sqlx::query_as::<_, ArtistTrack>("SELECT * FROM artist_tracks OFFSET $1 LIMIT $2")
            .bind(offset)
            .bind(limit)
            .fetch_all(pool)
            .await?;
    Ok(artist_tracks)
}

pub async fn get_user_artists(
    pool: &Pool<Postgres>,
    offset: i64,
    limit: i64,
) -> Result<Vec<UserArtist>, Error> {
    let user_artists =
        sqlx::query_as::<_, UserArtist>("SELECT * FROM user_artists OFFSET $1 LIMIT $2")
            .bind(offset)
            .bind(limit)
            .fetch_all(pool)
            .await?;
    Ok(user_artists)
}

pub async fn insert_artist_album(
    pool: &Pool<Postgres>,
    artist_album: &ArtistAlbum,
) -> Result<(), Error> {
    sqlx::query(
        r#"INSERT INTO artist_albums (
        xata_id,
        artist_id,
        album_id,
        xata_createdat
    ) VALUES ($1, $2, $3, $4)
      ON CONFLICT (xata_id) DO NOTHING"#,
    )
    .bind(&artist_album.xata_id)
    .bind(&artist_album.artist_id)
    .bind(&artist_album.album_id)
    .bind(artist_album.xata_createdat)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn insert_artist_track(
    pool: &Pool<Postgres>,
    artist_track: &ArtistTrack,
) -> Result<(), Error> {
    sqlx::query(
        r#"INSERT INTO artist_tracks (
        xata_id,
        artist_id,
        track_id,
        xata_createdat
    ) VALUES ($1, $2, $3, $4)
      ON CONFLICT (xata_id) DO NOTHING"#,
    )
    .bind(&artist_track.xata_id)
    .bind(&artist_track.artist_id)
    .bind(&artist_track.track_id) // Reusing album_id field for track_id
    .bind(artist_track.xata_createdat)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn insert_user_artist(
    pool: &Pool<Postgres>,
    user_artist: &UserArtist,
) -> Result<(), Error> {
    sqlx::query(
        r#"INSERT INTO user_artists (
        xata_id,
        user_id,
        artist_id,
        uri,
        xata_createdat
    ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (xata_id) DO NOTHING"#,
    )
    .bind(&user_artist.xata_id)
    .bind(&user_artist.user_id)
    .bind(&user_artist.artist_id)
    .bind(&user_artist.uri)
    .bind(user_artist.xata_createdat)
    .execute(pool)
    .await?;
    Ok(())
}
