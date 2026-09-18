pub mod album;
pub mod api_key;
pub mod artist;
pub mod spotify_account;
pub mod spotify_token;
pub mod track;
pub mod user;

#[cfg(test)]
mod sqlite_tests {
    use rocksky_db::Backend;

    /// Every lookup this service makes, executed against a real SQLite.
    ///
    /// They were all raw SQL with `$N` placeholders, which SQLite reads as
    /// nothing, so none of them could run there. Empty results are the point:
    /// what is being checked is that each statement parses and binds.
    #[tokio::test]
    async fn every_lookup_runs_on_sqlite() {
        let db: Backend = rocksky_db::connect_in_memory().await.unwrap();

        assert!(super::user::get_user_by_apikey(&db, "nope")
            .await
            .unwrap()
            .is_none());
        assert!(super::user::get_user_by_did(&db, "did:plc:nobody")
            .await
            .unwrap()
            .is_none());
        assert!(super::api_key::get_apikey(&db, "nope", "did:plc:nobody")
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
        assert!(
            super::spotify_account::get_spotify_account(&db, "did:plc:nobody")
                .await
                .unwrap()
                .is_none()
        );
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

        // These two promise a row, so no row is an error rather than a panic —
        // they used to index into an empty vector.
        assert!(super::album::get_album_by_track_id(&db, "rec_none")
            .await
            .is_err());
        assert!(super::album::get_album_by_uri(&db, "at://x").await.is_err());
        assert!(super::artist::get_artist_by_track_id(&db, "rec_none")
            .await
            .is_err());
        assert!(super::artist::get_artist_by_uri(&db, "at://x")
            .await
            .is_err());
    }
}
