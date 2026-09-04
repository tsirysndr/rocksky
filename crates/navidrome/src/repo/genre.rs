use anyhow::Error;
use sqlx::{Pool, Postgres};

use crate::repo::track::track_select;

use crate::xata::track::TrackWithUpload;

pub struct GenreRow {
    pub genre: String,
    pub song_count: i64,
    pub album_count: i64,
}

impl sqlx::FromRow<'_, sqlx::postgres::PgRow> for GenreRow {
    fn from_row(row: &sqlx::postgres::PgRow) -> Result<Self, sqlx::Error> {
        use sqlx::Row;
        Ok(Self {
            genre: row.try_get("genre")?,
            song_count: row.try_get("song_count")?,
            album_count: row.try_get("album_count")?,
        })
    }
}

pub async fn get_genres(pool: &Pool<Postgres>, user_id: &str) -> Result<Vec<GenreRow>, Error> {
    let rows: Vec<GenreRow> = sqlx::query_as(
        r#"
        SELECT
            UNNEST(artists.genres) AS genre,
            COUNT(DISTINCT artist_tracks.track_id) AS song_count,
            COUNT(DISTINCT artist_albums.album_id) AS album_count
        FROM artists
        JOIN artist_tracks ON artists.xata_id = artist_tracks.artist_id
        JOIN user_uploads ON artist_tracks.track_id = user_uploads.track_id
        LEFT JOIN artist_albums ON artists.xata_id = artist_albums.artist_id
        WHERE user_uploads.user_id = $1
          AND artists.genres IS NOT NULL
        GROUP BY genre
        ORDER BY genre ASC
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    Ok(rows)
}

pub async fn get_songs_by_genre(
    pool: &Pool<Postgres>,
    user_id: &str,
    genre: &str,
    count: i64,
    offset: i64,
) -> Result<Vec<TrackWithUpload>, Error> {
    // Hand-rolling the projection here left out the BYO-storage columns that
    // were later added to `TrackWithUpload`, so every row failed to deserialize
    // and getSongsByGenre returned nothing at all. Use the canonical select,
    // which is also the one that guards the album/artist junction lookups.
    let rows: Vec<TrackWithUpload> = sqlx::query_as(&format!(
        r#"
        {}
        WHERE EXISTS (
            SELECT 1
            FROM artist_tracks
            JOIN artists ON artist_tracks.artist_id = artists.xata_id
            WHERE artist_tracks.track_id = tracks.xata_id
              AND $2 = ANY(artists.genres)
        )
        ORDER BY tracks.title ASC, tracks.xata_id ASC
        LIMIT $3 OFFSET $4
        "#,
        track_select("$1")
    ))
    .bind(user_id)
    .bind(genre)
    .bind(count)
    .bind(offset)
    .fetch_all(pool)
    .await?;

    Ok(rows)
}
