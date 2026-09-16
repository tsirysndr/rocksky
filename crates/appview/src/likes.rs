//! Loved-track counts, folded into whatever list a handler is returning.
//!
//! The port of `apps/api/src/lib/trackLikes.ts`, which resolves likes through
//! `tracks.sha256` rather than the track row id: `lovedtracks.service` picks
//! the row to like by `sha256(lower("title - artist - album"))`, so the hash is
//! the identity a like is really attached to.
//!
//! Worth knowing for anyone changing this: `tracks.sha256` is `UNIQUE` in both
//! schemas, so today the hash and the row id are in one-to-one correspondence
//! and matching on either gives the same answer. Going through the hash is kept
//! because it stays correct if that constraint is ever relaxed — which is the
//! scenario `trackLikes.ts` describes, where one song has several rows.

use crate::db::Backend;
use std::collections::{HashMap, HashSet};

/// How many people have liked a track, and whether the caller is one of them.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Likes {
    pub count: i64,
    pub liked: bool,
}

/// Resolves likes for a set of track row ids.
///
/// `liked` is always false without a DID, so an unauthenticated caller still
/// gets the counts. Returns a map keyed by the *row id* that was asked for,
/// even though the matching happens by sha256, so callers can look up the row
/// they hold.
pub async fn for_track_ids(
    db: &Backend,
    track_ids: &[String],
    did: Option<&str>,
) -> Result<HashMap<String, Likes>, sqlx::Error> {
    let unique: Vec<&String> = {
        let mut seen = HashSet::new();
        track_ids.iter().filter(|id| seen.insert(*id)).collect()
    };
    if unique.is_empty() {
        return Ok(HashMap::new());
    }

    // row id -> sha256 for the tracks asked about.
    let mut identities = db.sql("SELECT xata_id, sha256 FROM tracks WHERE xata_id IN ");
    identities.bind_list(unique.iter().map(|id| id.as_str()));

    let sha_by_id: HashMap<String, String> = db
        .fetch_all::<(String, String)>(&identities)
        .await?
        .into_iter()
        .collect();

    let shas: Vec<String> = {
        let mut seen = HashSet::new();
        sha_by_id
            .values()
            .filter(|sha| !sha.is_empty() && seen.insert((*sha).clone()))
            .cloned()
            .collect()
    };
    if shas.is_empty() {
        return Ok(HashMap::new());
    }

    // Every like on any row sharing one of those sha256s.
    let mut likes = db.sql(
        "SELECT t.sha256, u.did \
         FROM loved_tracks l \
         INNER JOIN tracks t ON t.xata_id = l.track_id \
         LEFT JOIN users u ON u.xata_id = l.user_id \
         WHERE t.sha256 IN ",
    );
    likes.bind_list(shas.iter().map(|sha| sha.as_str()));

    let rows: Vec<(String, Option<String>)> = db.fetch_all(&likes).await?;

    let mut by_sha: HashMap<&str, Likes> = HashMap::new();
    for (sha, liker) in &rows {
        let entry = by_sha.entry(sha.as_str()).or_default();
        entry.count += 1;
        if let (Some(did), Some(liker)) = (did, liker.as_deref()) {
            if liker == did {
                entry.liked = true;
            }
        }
    }

    Ok(sha_by_id
        .into_iter()
        .map(|(id, sha)| {
            let likes = by_sha.get(sha.as_str()).copied().unwrap_or_default();
            (id, likes)
        })
        .collect())
}

/// Likes for a single track row id.
pub async fn for_track_id(
    db: &Backend,
    track_id: &str,
    did: Option<&str>,
) -> Result<Likes, sqlx::Error> {
    let map = for_track_ids(db, std::slice::from_ref(&track_id.to_string()), did).await?;
    Ok(map.get(track_id).copied().unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    /// One user, one liker and one track. Inserted through the query builder
    /// so the fixture exercises the same binding path as the handlers.
    async fn fixture() -> (Backend, String, String, String) {
        let db = db::connect_in_memory().await.unwrap();

        let alice = db::new_id();
        let bob = db::new_id();
        for (id, did, handle) in [
            (&alice, "did:plc:alice", "alice.test"),
            (&bob, "did:plc:bob", "bob.test"),
        ] {
            let mut sql = db.sql("INSERT INTO users (xata_id, did, handle, avatar) VALUES (");
            sql.bind(id)
                .push(", ")
                .bind(did)
                .push(", ")
                .bind(handle)
                .push(", ")
                .bind("a")
                .push(")");
            db.execute(&sql).await.unwrap();
        }

        let track = db::new_id();
        let mut sql = db.sql(
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
            .bind("sha-roygbiv")
            .push(")");
        db.execute(&sql).await.unwrap();

        (db, alice, bob, track)
    }

    /// Records `user` liking `track`.
    async fn like(db: &Backend, user: &str, track: &str) {
        let mut sql = db.sql("INSERT INTO loved_tracks (xata_id, user_id, track_id) VALUES (");
        sql.bind(db::new_id())
            .push(", ")
            .bind(user)
            .push(", ")
            .bind(track)
            .push(")");
        db.execute(&sql).await.unwrap();
    }

    #[tokio::test]
    async fn no_track_ids_means_no_queries_and_no_results() {
        let db = db::connect_in_memory().await.unwrap();
        let likes = for_track_ids(&db, &[], Some("did:plc:alice"))
            .await
            .unwrap();
        assert!(likes.is_empty());
    }

    #[tokio::test]
    async fn counts_are_returned_without_a_did_and_liked_stays_false() {
        let (db, alice, _bob, track) = fixture().await;

        like(&db, &alice, &track).await;

        let anonymous = for_track_id(&db, &track, None).await.unwrap();
        assert_eq!(anonymous.count, 1, "counts are public");
        assert!(!anonymous.liked, "nobody is the caller when anonymous");
    }

    #[tokio::test]
    async fn liked_is_true_only_for_the_caller() {
        let (db, alice, bob, track) = fixture().await;

        like(&db, &alice, &track).await;

        assert!(
            for_track_id(&db, &track, Some("did:plc:alice"))
                .await
                .unwrap()
                .liked
        );
        assert!(
            !for_track_id(&db, &track, Some("did:plc:bob"))
                .await
                .unwrap()
                .liked
        );
        // And the count is the same for both.
        assert_eq!(
            for_track_id(&db, &track, Some("did:plc:bob"))
                .await
                .unwrap()
                .count,
            1
        );
        let _ = bob;
    }

    #[tokio::test]
    async fn a_track_with_no_likes_reports_zero_rather_than_being_absent() {
        let (db, _alice, _bob, track) = fixture().await;
        let likes = for_track_id(&db, &track, Some("did:plc:alice"))
            .await
            .unwrap();
        assert_eq!(
            likes,
            Likes {
                count: 0,
                liked: false
            }
        );
    }

    #[tokio::test]
    async fn an_unknown_track_id_reports_zero() {
        let (db, _alice, _bob, _track) = fixture().await;
        let likes = for_track_id(&db, "rec_nope", Some("did:plc:alice"))
            .await
            .unwrap();
        assert_eq!(likes.count, 0);
    }

    #[tokio::test]
    async fn duplicate_ids_in_the_request_are_counted_once() {
        let (db, alice, _bob, track) = fixture().await;
        like(&db, &alice, &track).await;

        let ids = vec![track.clone(), track.clone(), track.clone()];
        let likes = for_track_ids(&db, &ids, Some("did:plc:alice"))
            .await
            .unwrap();
        assert_eq!(likes.len(), 1);
        assert_eq!(likes[&track].count, 1, "not tripled");
    }
}
