//! Batch loaders for the catalogue rows a view needs.
//!
//! The TypeScript handlers select every joined table in one statement and let
//! Drizzle hand back `{ scrobbles, tracks, users, artists }`. That does not
//! translate directly: each model's column list aliases `xata_id AS id`, so
//! selecting four of them in one statement produces four columns called `id`
//! and `FromRow` would read whichever came first.
//!
//! So the join is still used for *filtering and ordering* — an RSQL filter on
//! `track.title` needs it — but only the driving table's columns are selected.
//! The related rows are then fetched by id, one batched query per table. That
//! keeps one unambiguous column list per query and stays O(1) in round trips
//! rather than O(rows).

use super::models::{Album, Artist, Track, User, ALBUM_COLS, ARTIST_COLS, TRACK_COLS, USER_COLS};
use super::Backend;
use std::collections::{HashMap, HashSet};

/// Deduplicates ids, dropping the `None`s that a `LEFT JOIN` produces.
fn unique(ids: impl IntoIterator<Item = Option<String>>) -> Vec<String> {
    let mut seen = HashSet::new();
    ids.into_iter()
        .flatten()
        .filter(|id| !id.is_empty())
        .filter(|id| seen.insert(id.clone()))
        .collect()
}

/// Generates a `<table>_by_id` loader. They differ only in table, column list
/// and row type, so the shape is written once.
macro_rules! loader {
    ($name:ident, $model:ty, $cols:ident, $table:literal) => {
        pub async fn $name(
            db: &Backend,
            ids: impl IntoIterator<Item = Option<String>>,
        ) -> Result<HashMap<String, $model>, sqlx::Error> {
            let ids = unique(ids);
            if ids.is_empty() {
                return Ok(HashMap::new());
            }

            let mut query = sea_query::Query::select();
            db.select_model(&mut query, $cols, None);
            query.from(sea_query::Alias::new($table)).and_where(
                sea_query::Expr::col(sea_query::Alias::new("xata_id"))
                    .is_in(ids.iter().map(|id| id.as_str())),
            );

            Ok(db
                .fetch_all::<$model>(&query)
                .await?
                .into_iter()
                .map(|row| (row.id.clone(), row))
                .collect())
        }
    };
}

loader!(tracks_by_id, Track, TRACK_COLS, "tracks");
loader!(users_by_id, User, USER_COLS, "users");
loader!(artists_by_id, Artist, ARTIST_COLS, "artists");
loader!(albums_by_id, Album, ALBUM_COLS, "albums");

#[cfg(test)]
mod tests {
    use super::*;
    use crate as db;

    async fn fixture() -> (Backend, String, String, String, String) {
        let backend = db::connect_in_memory().await.unwrap();

        let user = db::new_id();
        let mut sql = backend.sql("INSERT INTO users (xata_id, did, handle, avatar) VALUES (");
        sql.bind(&user)
            .push(", ")
            .bind("did:plc:alice")
            .push(", ")
            .bind("alice.test")
            .push(", ")
            .bind("a")
            .push(")");
        backend.execute(&sql).await.unwrap();

        let artist = db::new_id();
        let mut sql = backend.sql("INSERT INTO artists (xata_id, name, sha256, genres) VALUES (");
        sql.bind(&artist)
            .push(", ")
            .bind("Boards of Canada")
            .push(", ")
            .bind("sha-artist")
            .push(", ")
            .bind(r#"["electronic"]"#)
            .push(")");
        backend.execute(&sql).await.unwrap();

        let album = db::new_id();
        let mut sql = backend.sql("INSERT INTO albums (xata_id, title, artist, sha256) VALUES (");
        sql.bind(&album)
            .push(", ")
            .bind("Music Has the Right to Children")
            .push(", ")
            .bind("Boards of Canada")
            .push(", ")
            .bind("sha-album")
            .push(")");
        backend.execute(&sql).await.unwrap();

        let track = db::new_id();
        let mut sql = backend.sql(
            "INSERT INTO tracks \
             (xata_id, title, artist, album_artist, album, duration, sha256) VALUES (",
        );
        sql.bind(&track)
            .push(", ")
            .bind("Roygbiv")
            .push(", ")
            .bind("Boards of Canada")
            .push(", ")
            .bind("Boards of Canada")
            .push(", ")
            .bind("Music Has the Right to Children")
            .push(", ")
            .bind(151_000i64)
            .push(", ")
            .bind("sha-track")
            .push(")");
        backend.execute(&sql).await.unwrap();

        (backend, user, artist, album, track)
    }

    #[tokio::test]
    async fn each_loader_returns_rows_keyed_by_id() {
        let (db, user, artist, album, track) = fixture().await;

        let tracks = tracks_by_id(&db, [Some(track.clone())]).await.unwrap();
        assert_eq!(tracks[&track].title, "Roygbiv");

        let users = users_by_id(&db, [Some(user.clone())]).await.unwrap();
        assert_eq!(users[&user].handle, "alice.test");

        let artists = artists_by_id(&db, [Some(artist.clone())]).await.unwrap();
        assert_eq!(artists[&artist].genres(), vec!["electronic"]);

        let albums = albums_by_id(&db, [Some(album.clone())]).await.unwrap();
        assert_eq!(albums[&album].title, "Music Has the Right to Children");
    }

    #[tokio::test]
    async fn nulls_and_duplicates_are_dropped_before_querying() {
        let (db, _user, _artist, _album, track) = fixture().await;

        // A LEFT JOIN yields None for unmatched rows; those must not become a
        // `WHERE xata_id IN (NULL)` lookup, nor be asked for twice.
        let tracks = tracks_by_id(
            &db,
            [
                Some(track.clone()),
                None,
                Some(track.clone()),
                Some(String::new()),
            ],
        )
        .await
        .unwrap();
        assert_eq!(tracks.len(), 1);
        assert!(tracks.contains_key(&track));
    }

    #[tokio::test]
    async fn no_ids_means_no_query_and_an_empty_map() {
        let (db, ..) = fixture().await;
        assert!(tracks_by_id(&db, []).await.unwrap().is_empty());
        assert!(tracks_by_id(&db, [None]).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn unknown_ids_are_simply_absent() {
        let (db, ..) = fixture().await;
        let tracks = tracks_by_id(&db, [Some("rec_nope".to_string())])
            .await
            .unwrap();
        assert!(tracks.is_empty(), "a missing row must not be invented");
    }
}
