use anyhow::Error;
use sqlx::{Pool, Postgres};

use crate::xata::track::TrackWithUpload;

/// The column list every track row is built from. Split out from the joins so
/// the paged form below can drive off a different table without a second copy.
const TRACK_COLUMNS: &str = r#"
    SELECT
        tracks.xata_id,
        tracks.title,
        tracks.artist,
        tracks.album_artist,
        tracks.album_art,
        tracks.album,
        tracks.track_number,
        tracks.disc_number,
        tracks.duration,
        tracks.mb_id,
        tracks.genre,
        tracks.xata_createdat,
        user_uploads.r2_key,
        user_uploads.mime_type,
        user_uploads.file_size,
        user_uploads.sample_rate,
        alb.album_id,
        art.artist_id,
        usp.xata_id AS storage_provider_id,
        usp.endpoint AS storage_endpoint,
        usp.region AS storage_region,
        usp.bucket AS storage_bucket,
        usp.access_key AS storage_access_key,
        usp.secret_key AS storage_secret_key,
        usp.public_url AS storage_public_url
"#;

/// Storage provider plus the album/artist id each track resolves to. Evaluated
/// once per row, so it belongs after whatever narrowed the rows down.
const TRACK_JOINS: &str = r#"
    LEFT JOIN user_storage_providers usp ON user_uploads.storage_provider_id = usp.xata_id
    LEFT JOIN LATERAL (
        SELECT at2.album_id FROM album_tracks at2
        JOIN albums a ON at2.album_id = a.xata_id
        WHERE at2.track_id = tracks.xata_id
          AND lower(tracks.album) = lower(a.title)
          AND lower(tracks.album_artist) = lower(a.artist)
        LIMIT 1
    ) alb ON true
    LEFT JOIN LATERAL (
        SELECT at3.artist_id FROM artist_tracks at3
        JOIN artists ar ON at3.artist_id = ar.xata_id
        WHERE at3.track_id = tracks.xata_id
          AND lower(tracks.album_artist) = lower(ar.name)
        LIMIT 1
    ) art ON true
"#;

/// Every track column, joined from `tracks`. Callers append their own WHERE.
pub fn track_select() -> String {
    format!(
        "{TRACK_COLUMNS}\n    FROM tracks\n    JOIN user_uploads ON tracks.xata_id = user_uploads.track_id\n{TRACK_JOINS}"
    )
}

pub async fn get_tracks_by_album(
    pool: &Pool<Postgres>,
    album_id: &str,
    user_id: &str,
) -> Result<Vec<TrackWithUpload>, Error> {
    let rows: Vec<TrackWithUpload> = sqlx::query_as(&format!(
        r#"
        {}
        JOIN album_tracks ON tracks.xata_id = album_tracks.track_id
        JOIN albums ON album_tracks.album_id = albums.xata_id
                    AND lower(tracks.album) = lower(albums.title)
                    AND lower(tracks.album_artist) = lower(albums.artist)
        WHERE album_tracks.album_id = $1
          AND user_uploads.user_id = $2
        ORDER BY tracks.disc_number ASC NULLS FIRST, tracks.track_number ASC NULLS FIRST, tracks.xata_id ASC
        "#,
        track_select()
    ))
    .bind(album_id)
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    Ok(rows)
}

/// Minimal row needed to resolve a stream URL — avoids the `tracks` join and
/// the two LATERAL album/artist lookups that `TRACK_SELECT` carries.
#[derive(Debug, sqlx::FromRow, Clone)]
pub struct StreamTrack {
    pub r2_key: String,
    pub storage_provider_id: Option<String>,
    pub storage_endpoint: Option<String>,
    pub storage_region: Option<String>,
    pub storage_bucket: Option<String>,
    pub storage_access_key: Option<String>,
    pub storage_secret_key: Option<String>,
    pub storage_public_url: Option<String>,
}

pub async fn get_stream_track_by_id(
    pool: &Pool<Postgres>,
    track_id: &str,
    user_id: &str,
) -> Result<Option<StreamTrack>, Error> {
    let row: Option<StreamTrack> = sqlx::query_as(
        r#"
        SELECT
            u.r2_key,
            usp.xata_id     AS storage_provider_id,
            usp.endpoint    AS storage_endpoint,
            usp.region      AS storage_region,
            usp.bucket      AS storage_bucket,
            usp.access_key  AS storage_access_key,
            usp.secret_key  AS storage_secret_key,
            usp.public_url  AS storage_public_url
        FROM user_uploads u
        LEFT JOIN user_storage_providers usp ON u.storage_provider_id = usp.xata_id
        WHERE u.track_id = $1 AND u.user_id = $2
        "#,
    )
    .bind(track_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    Ok(row)
}

pub async fn get_track_by_id(
    pool: &Pool<Postgres>,
    track_id: &str,
    user_id: &str,
) -> Result<Option<TrackWithUpload>, Error> {
    let row: Option<TrackWithUpload> = sqlx::query_as(&format!(
        r#"
        {}
        WHERE tracks.xata_id = $1
          AND user_uploads.user_id = $2
        "#,
        track_select()
    ))
    .bind(track_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    Ok(row)
}

pub async fn get_random_songs(
    pool: &Pool<Postgres>,
    user_id: &str,
    count: i64,
    genre: Option<&str>,
    from_year: Option<i32>,
    to_year: Option<i32>,
) -> Result<Vec<TrackWithUpload>, Error> {
    let mut filters = vec!["user_uploads.user_id = $1".to_string()];

    if let Some(g) = genre {
        filters.push(format!(
            "LOWER(tracks.genre) = LOWER('{}')",
            g.replace('\'', "''")
        ));
    }
    if let Some(from) = from_year {
        if let Some(to) = to_year {
            filters.push(format!(
                "EXTRACT(YEAR FROM tracks.xata_createdat) BETWEEN {} AND {}",
                from.min(to),
                from.max(to)
            ));
        }
    }

    let where_clause = filters.join(" AND ");

    let sql = format!(
        r#"
        {}
        WHERE {}
        ORDER BY RANDOM()
        LIMIT $2
        "#,
        track_select(),
        where_clause
    );

    let rows: Vec<TrackWithUpload> = sqlx::query_as(&sql)
        .bind(user_id)
        .bind(count)
        .fetch_all(pool)
        .await?;

    Ok(rows)
}

/// Tracks matching `query`, or the whole library when it is empty — the
/// library's Tracks tab searches with a blank query.
///
/// Paged in two steps. The page of upload ids is picked first, off nothing but
/// `user_uploads` and `tracks`, and only those rows then get the storage
/// provider and the two LATERAL id lookups. Doing it in one pass made those
/// laterals run for every row the OFFSET was about to throw away, so the cost
/// grew with how far the user had scrolled: at offset 5000 of a 7.2k-track
/// library, 840ms against 40ms for this.
///
/// Paging on `user_uploads.xata_id` rather than the track is deliberate: 576
/// (user, track) pairs have more than one upload row, and paging on the track
/// would multiply those rows a second time when the outer query rejoined.
pub async fn search_tracks(
    pool: &Pool<Postgres>,
    user_id: &str,
    query: &str,
    count: i64,
    offset: i64,
) -> Result<Vec<TrackWithUpload>, Error> {
    // An empty query means "everything". LIKE '%%' matches every row anyway,
    // but it is not sargable and forces a LOWER() over the whole library, so
    // leave the predicate out entirely rather than asking for a no-op.
    let title_filter = if query.is_empty() {
        ""
    } else {
        "AND LOWER(tracks.title) LIKE LOWER($4)"
    };

    let sql = format!(
        r#"
        WITH page AS MATERIALIZED (
            SELECT user_uploads.xata_id AS upload_id
            FROM tracks
            JOIN user_uploads ON tracks.xata_id = user_uploads.track_id
            WHERE user_uploads.user_id = $1
              {title_filter}
            ORDER BY tracks.title ASC, tracks.xata_id ASC
            LIMIT $2 OFFSET $3
        )
        {TRACK_COLUMNS}
        FROM page
        JOIN user_uploads ON user_uploads.xata_id = page.upload_id
        JOIN tracks ON tracks.xata_id = user_uploads.track_id
        {TRACK_JOINS}
        ORDER BY tracks.title ASC, tracks.xata_id ASC
        "#
    );

    let mut q = sqlx::query_as::<_, TrackWithUpload>(&sql)
        .bind(user_id)
        .bind(count)
        .bind(offset);
    if !query.is_empty() {
        q = q.bind(format!("%{}%", query));
    }
    let rows: Vec<TrackWithUpload> = q.fetch_all(pool).await?;

    Ok(rows)
}

pub async fn get_tracks_by_ids(
    pool: &Pool<Postgres>,
    ids: &[String],
    user_id: &str,
) -> Result<Vec<TrackWithUpload>, Error> {
    if ids.is_empty() {
        return Ok(vec![]);
    }
    let rows: Vec<TrackWithUpload> = sqlx::query_as(&format!(
        r#"
        {}
        WHERE tracks.xata_id = ANY($1)
          AND user_uploads.user_id = $2
        "#,
        track_select()
    ))
    .bind(ids)
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    // Preserve the order Typesense returned.
    let mut map: std::collections::HashMap<String, TrackWithUpload> =
        rows.into_iter().map(|t| (t.xata_id.clone(), t)).collect();
    Ok(ids.iter().filter_map(|id| map.remove(id)).collect())
}

pub async fn get_album_art_by_track_id(
    pool: &Pool<Postgres>,
    track_id: &str,
) -> Result<Option<String>, Error> {
    let row: Option<(Option<String>,)> =
        sqlx::query_as(r#"SELECT album_art FROM tracks WHERE xata_id = $1"#)
            .bind(track_id)
            .fetch_optional(pool)
            .await?;

    Ok(row.and_then(|(art,)| art))
}

pub async fn get_album_id_for_track(
    pool: &Pool<Postgres>,
    track_id: &str,
) -> Result<Option<String>, Error> {
    let row: Option<(String,)> = sqlx::query_as(
        r#"SELECT at2.album_id FROM album_tracks at2
           JOIN albums a ON at2.album_id = a.xata_id
           JOIN tracks t ON at2.track_id = t.xata_id
           WHERE at2.track_id = $1
             AND lower(t.album) = lower(a.title)
             AND lower(t.album_artist) = lower(a.artist)
           LIMIT 1"#,
    )
    .bind(track_id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|(id,)| id))
}

pub async fn get_artist_id_for_track(
    pool: &Pool<Postgres>,
    track_id: &str,
) -> Result<Option<String>, Error> {
    let row: Option<(String,)> = sqlx::query_as(
        r#"SELECT at3.artist_id FROM artist_tracks at3
           JOIN artists ar ON at3.artist_id = ar.xata_id
           JOIN tracks t ON at3.track_id = t.xata_id
           WHERE at3.track_id = $1
             AND lower(t.album_artist) = lower(ar.name)
           LIMIT 1"#,
    )
    .bind(track_id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|(id,)| id))
}
