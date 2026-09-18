pub mod album;
pub mod artist;
pub mod spotify_account;
pub mod spotify_token;
pub mod track;
pub mod user;
pub mod webscrobbler;

#[cfg(test)]
mod sqlite_tests {
    use rocksky_db::Backend;

    /// Every lookup this service makes, on a real SQLite. See the sibling test
    /// in `rocksky-scrobbler` for why.
    #[tokio::test]
    async fn every_lookup_runs_on_sqlite() {
        let db: Backend = rocksky_db::connect_in_memory().await.unwrap();

        assert!(super::user::get_user_by_webscrobbler(&db, "uuid")
            .await
            .unwrap()
            .is_none());
        assert!(super::webscrobbler::get_webscrobbler(&db, "uuid")
            .await
            .unwrap()
            .is_none());
        assert!(super::track::get_track(&db, "Roygbiv", "Boards of Canada")
            .await
            .unwrap()
            .is_none());
        assert!(super::track::get_track_by_mbid(&db, "mb-1")
            .await
            .unwrap()
            .is_none());
        assert!(super::spotify_account::get_spotify_account(&db, "rec_none")
            .await
            .unwrap()
            .is_none());
        assert!(
            super::spotify_token::get_spotify_token(&db, "did:plc:nobody")
                .await
                .unwrap()
                .is_none()
        );
        assert!(super::spotify_token::get_spotify_tokens(&db, 10)
            .await
            .unwrap()
            .is_empty());

        assert!(super::album::get_album_by_track_id(&db, "rec_none")
            .await
            .is_err());
        assert!(super::artist::get_artist_by_track_id(&db, "rec_none")
            .await
            .is_err());
    }
}
