use rocksky_db::Backend;
use rocksky_matching::{catalog::Catalog, providers::Provider, resolve, MatchRequest, Status};
async fn fixture() -> Catalog {
    let db = Backend::connect("sqlite::memory:").await.unwrap();
    db.execute(&db.sql("INSERT INTO tracks (xata_id,title,artist,album_artist,album,duration,sha256,isrc) VALUES ('one','Beat It','Michael Jackson','Michael Jackson','Thriller',240000,'hash','USABC1234567'),('two','Thriller','Michael Jackson','Michael Jackson','Thriller',240000,'hash2','USABC1234567')")).await.unwrap();
    Catalog { db }
}
fn request() -> MatchRequest {
    serde_json::from_value(
        serde_json::json!({"title":"Beat It","artists":["Michael Jackson"],"album":"Thriller"}),
    )
    .unwrap()
}
#[tokio::test]
async fn database_candidates_pass_through_shared_policy() {
    let catalog = fixture().await;
    let r = request();
    let candidates = catalog.candidates(&r).await.unwrap();
    assert_eq!(resolve(&r, candidates).unwrap().track.unwrap().id, "one");
}
#[tokio::test]
async fn colliding_isrc_does_not_allow_wrong_title() {
    let catalog = fixture().await;
    let mut r = request();
    r.identifiers.isrc = Some("USABC1234567".into());
    let candidates = catalog.candidates(&r).await.unwrap();
    assert_eq!(candidates.len(), 2);
    let result = resolve(&r, candidates).unwrap();
    assert_eq!(result.track.unwrap().id, "one");
    assert_eq!(result.rejected.len(), 1);
}
#[tokio::test]
async fn catalog_wrong_album_has_no_fallback() {
    let catalog = fixture().await;
    let mut r = request();
    r.album = Some("Bad".into());
    let candidates = catalog.candidates(&r).await.unwrap();
    assert_eq!(resolve(&r, candidates).unwrap().status, Status::Unmatched);
}
#[tokio::test]
async fn sql_input_is_bound() {
    let catalog = fixture().await;
    let mut r = request();
    r.title = "' OR 1=1 --".into();
    assert!(catalog.candidates(&r).await.unwrap().is_empty());
}
#[tokio::test]
async fn joined_release_matches_and_is_returned_as_that_album() {
    let catalog = fixture().await;
    catalog.db.execute(&catalog.db.sql("INSERT INTO albums (xata_id,title,artist,sha256) VALUES ('album','Compilation','Michael Jackson','album-hash')")).await.unwrap();
    catalog
        .db
        .execute(&catalog.db.sql(
            "INSERT INTO album_tracks (xata_id,album_id,track_id) VALUES ('link','album','one')",
        ))
        .await
        .unwrap();
    let mut r = request();
    r.album = Some("Compilation".into());
    let c = catalog.candidates(&r).await.unwrap();
    assert_eq!(
        resolve(&r, c).unwrap().track.unwrap().album.as_deref(),
        Some("Compilation")
    );
}
#[tokio::test]
async fn joined_release_cannot_hide_track_remaster_metadata() {
    let catalog = fixture().await;
    catalog
        .db
        .execute(
            &catalog
                .db
                .sql("UPDATE tracks SET album='Thriller (Remastered)' WHERE xata_id='one'"),
        )
        .await
        .unwrap();
    catalog.db.execute(&catalog.db.sql("INSERT INTO albums (xata_id,title,artist,sha256) VALUES ('album','Thriller','Michael Jackson','album-hash')")).await.unwrap();
    catalog
        .db
        .execute(&catalog.db.sql(
            "INSERT INTO album_tracks (xata_id,album_id,track_id) VALUES ('link','album','one')",
        ))
        .await
        .unwrap();
    let r = request();
    let c = catalog.candidates(&r).await.unwrap();
    assert_eq!(resolve(&r, c).unwrap().status, Status::Unmatched);
}
