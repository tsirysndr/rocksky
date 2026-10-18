pub mod album;
pub mod album_track;
pub mod artist;
pub mod artist_album;
pub mod artist_track;
pub mod feed;
pub mod follow;
pub mod loved_track;
pub mod scrobble;
pub mod track;
pub mod user;
pub mod user_album;
pub mod user_artist;
pub mod user_playlist;
pub mod user_track;

#[cfg(test)]
mod tests {
    use super::{user_album::UserAlbum, user_artist::UserArtist, user_track::UserTrack};

    #[tokio::test]
    #[ignore = "requires ROCKSKY_TEST_POSTGRES_URL; performs read-only queries"]
    async fn postgres_link_rows_accept_local_and_xata_timestamps() {
        let url = std::env::var("ROCKSKY_TEST_POSTGRES_URL").unwrap();
        let mut conn = <sqlx::PgConnection as sqlx::Connection>::connect(&url)
            .await
            .unwrap();
        sqlx::query("SET TIME ZONE 'Indian/Antananarivo'")
            .execute(&mut conn)
            .await
            .unwrap();
        for timestamp in [
            "TIMESTAMP '2026-01-02 03:04:05'",
            "TIMESTAMPTZ '2026-01-02 06:04:05+03'",
        ] {
            let query = format!(
                "SELECT 'id'::text AS xata_id, 'user'::text AS user_id, \
                 'artist'::text AS artist_id, 'album'::text AS album_id, \
                 'track'::text AS track_id, NULL::text AS uri, {timestamp} AS xata_createdat"
            );
            let artist: UserArtist = sqlx::query_as(&query).fetch_one(&mut conn).await.unwrap();
            let album: UserAlbum = sqlx::query_as(&query).fetch_one(&mut conn).await.unwrap();
            let track: UserTrack = sqlx::query_as(&query).fetch_one(&mut conn).await.unwrap();
            for at in [
                artist.xata_createdat,
                album.xata_createdat,
                track.xata_createdat,
            ] {
                assert_eq!(at.to_rfc3339(), "2026-01-02T03:04:05+00:00");
            }
        }
    }
}
