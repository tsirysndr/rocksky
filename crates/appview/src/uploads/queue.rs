//! The persisted upload player queue.
//!
//! One row per user in `upload_queue_state`, holding a JSON array of upload
//! ids and the index currently playing. The queue survives a reload, which is
//! the whole point — a browser refresh should not lose what you queued up.

use crate::db::{new_id, Backend};
use serde::{Deserialize, Serialize};

/// A queue entry, resolved for display.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct QueueEntry {
    pub upload_id: String,
    pub title: String,
    pub artist: String,
    pub album_artist: String,
    pub album: String,
    pub album_art: Option<String>,
    pub duration: i64,
    pub sha256: String,
    /// The track's AT-URI, or `""` when it has none — the UI expects a string
    /// here rather than null.
    pub song_uri: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueView {
    pub queue: Vec<QueueEntry>,
    pub current_index: i64,
}

/// Reads the queue, resolving each id to its track.
///
/// Ids that no longer resolve are dropped rather than erroring: an upload can
/// be deleted while it sits in someone's queue, and that must not make the
/// queue unreadable.
pub async fn load(db: &Backend, user_id: &str) -> Result<QueueView, sqlx::Error> {
    let mut sql =
        db.sql("SELECT upload_ids, current_index FROM upload_queue_state WHERE user_id = ");
    sql.bind(user_id).push(" LIMIT 1");

    let Some((raw, current_index)) = db.fetch_optional::<(String, i64)>(&sql).await? else {
        return Ok(QueueView::default());
    };

    let upload_ids: Vec<String> = serde_json::from_str(&raw).unwrap_or_default();
    if upload_ids.is_empty() {
        return Ok(QueueView {
            queue: Vec::new(),
            current_index,
        });
    }

    let mut sql = db.sql(
        "SELECT u.xata_id AS upload_id, t.title, t.artist, t.album_artist, t.album, \
         t.album_art, t.duration, t.sha256, COALESCE(t.uri, '') AS song_uri \
         FROM user_uploads u \
         INNER JOIN tracks t ON t.xata_id = u.track_id \
         WHERE u.user_id = ",
    );
    sql.bind(user_id)
        .push(" AND u.xata_id IN ")
        .bind_list(upload_ids.iter().map(|id| id.as_str()));

    let rows: Vec<QueueEntry> = db.fetch_all(&sql).await?;

    // Returned in the stored order, not the order the database happened to
    // give back — the queue *is* an ordering.
    let by_id: std::collections::HashMap<&str, &QueueEntry> = rows
        .iter()
        .map(|entry| (entry.upload_id.as_str(), entry))
        .collect();

    Ok(QueueView {
        queue: upload_ids
            .iter()
            .filter_map(|id| by_id.get(id.as_str()).map(|entry| (*entry).clone()))
            .collect(),
        current_index,
    })
}

/// Replaces the stored queue.
pub async fn save(
    db: &Backend,
    user_id: &str,
    upload_ids: &[String],
    current_index: i64,
) -> Result<(), sqlx::Error> {
    let encoded = serde_json::to_string(upload_ids).unwrap_or_else(|_| "[]".to_string());
    let now = crate::db::now_timestamp();

    // `user_id` is UNIQUE, so the upsert keeps one row per user.
    let mut sql = db.sql(
        "INSERT INTO upload_queue_state (xata_id, user_id, upload_ids, current_index) VALUES (",
    );
    sql.bind(new_id())
        .push(", ")
        .bind(user_id)
        .push(", ")
        .bind(&encoded)
        .push(", ")
        .bind(current_index)
        .push(
            ") ON CONFLICT (user_id) DO UPDATE SET \
             upload_ids = excluded.upload_ids, \
             current_index = excluded.current_index, \
             xata_updatedat = ",
        )
        .bind(&now);
    db.execute(&sql).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    async fn fixture() -> (Backend, String) {
        let backend = db::connect_in_memory().await.unwrap();
        let user_id = crate::ingest::upsert_user(&backend, "did:plc:alice")
            .await
            .unwrap();

        backend
            .execute(&backend.sql(
                "INSERT INTO tracks \
                 (xata_id, title, artist, album_artist, album, duration, sha256, uri) VALUES \
                 ('rec_t1', 'Roygbiv', 'BoC', 'BoC', 'MHTRTC', 151000, 'sha-t1', 'at://song/1'), \
                 ('rec_t2', 'Olson', 'BoC', 'BoC', 'MHTRTC', 90000, 'sha-t2', NULL)",
            ))
            .await
            .unwrap();

        for (id, track) in [("rec_u1", "rec_t1"), ("rec_u2", "rec_t2")] {
            let mut sql = backend.sql(
                "INSERT INTO user_uploads \
                 (xata_id, user_id, track_id, r2_key, mime_type, file_size, original_filename) \
                 VALUES (",
            );
            sql.bind(id)
                .push(", ")
                .bind(&user_id)
                .push(", ")
                .bind(track)
                .push(", ")
                .bind("k")
                .push(", ")
                .bind("audio/flac")
                .push(", ")
                .bind(1i64)
                .push(", ")
                .bind("f.flac")
                .push(")");
            backend.execute(&sql).await.unwrap();
        }

        (backend, user_id)
    }

    #[tokio::test]
    async fn an_absent_queue_is_empty_not_an_error() {
        let (db, user_id) = fixture().await;
        let view = load(&db, &user_id).await.unwrap();
        assert!(view.queue.is_empty());
        assert_eq!(view.current_index, 0);
    }

    #[tokio::test]
    async fn a_queue_round_trips_in_the_order_it_was_saved() {
        let (db, user_id) = fixture().await;

        // Deliberately not the insertion order, and with a repeat.
        let ids = vec!["rec_u2".to_string(), "rec_u1".to_string(), "rec_u2".to_string()];
        save(&db, &user_id, &ids, 1).await.unwrap();

        let view = load(&db, &user_id).await.unwrap();
        assert_eq!(view.current_index, 1);
        assert_eq!(
            view.queue.iter().map(|e| e.upload_id.as_str()).collect::<Vec<_>>(),
            vec!["rec_u2", "rec_u1", "rec_u2"],
            "the queue is an ordering, and a track can appear twice"
        );
        assert_eq!(view.queue[1].title, "Roygbiv");
        assert_eq!(view.queue[1].duration, 151_000);
        assert_eq!(view.queue[1].song_uri, "at://song/1");
        // A track with no URI reports "" rather than null.
        assert_eq!(view.queue[0].song_uri, "");
    }

    #[tokio::test]
    async fn saving_again_replaces_rather_than_appends() {
        let (db, user_id) = fixture().await;
        save(&db, &user_id, &["rec_u1".to_string()], 0).await.unwrap();
        save(&db, &user_id, &["rec_u2".to_string()], 0).await.unwrap();

        let rows = db
            .count(&db.sql("SELECT count(*) FROM upload_queue_state"))
            .await
            .unwrap();
        assert_eq!(rows, 1, "one row per user");

        let view = load(&db, &user_id).await.unwrap();
        assert_eq!(view.queue.len(), 1);
        assert_eq!(view.queue[0].upload_id, "rec_u2");
    }

    /// An upload can be deleted while it sits in a queue; that must not make
    /// the queue unreadable.
    #[tokio::test]
    async fn ids_that_no_longer_resolve_are_dropped() {
        let (db, user_id) = fixture().await;
        let ids = vec![
            "rec_u1".to_string(),
            "rec_gone".to_string(),
            "rec_u2".to_string(),
        ];
        save(&db, &user_id, &ids, 2).await.unwrap();

        let view = load(&db, &user_id).await.unwrap();
        assert_eq!(view.queue.len(), 2);
        // The stored index is returned as-is, even though it now points past
        // the end: correcting it here would silently move what is playing.
        assert_eq!(view.current_index, 2);
    }

    #[tokio::test]
    async fn another_users_uploads_are_not_resolvable_into_a_queue() {
        let (db, user_id) = fixture().await;
        let bob = crate::ingest::upsert_user(&db, "did:plc:bob").await.unwrap();

        // Bob storing Alice's upload ids resolves to nothing.
        save(&db, &bob, &["rec_u1".to_string()], 0).await.unwrap();
        assert!(load(&db, &bob).await.unwrap().queue.is_empty());
        // And Alice's own queue is unaffected.
        save(&db, &user_id, &["rec_u1".to_string()], 0).await.unwrap();
        assert_eq!(load(&db, &user_id).await.unwrap().queue.len(), 1);
    }

    #[tokio::test]
    async fn an_empty_queue_can_be_stored() {
        let (db, user_id) = fixture().await;
        save(&db, &user_id, &["rec_u1".to_string()], 0).await.unwrap();
        save(&db, &user_id, &[], 0).await.unwrap();
        assert!(load(&db, &user_id).await.unwrap().queue.is_empty());
    }

    #[tokio::test]
    async fn an_unreadable_stored_queue_reads_as_empty() {
        let (db, user_id) = fixture().await;
        let mut sql = db.sql(
            "INSERT INTO upload_queue_state (xata_id, user_id, upload_ids, current_index) \
             VALUES (",
        );
        sql.bind(new_id())
            .push(", ")
            .bind(&user_id)
            .push(", ")
            .bind("{not json")
            .push(", ")
            .bind(0i64)
            .push(")");
        db.execute(&sql).await.unwrap();

        assert!(load(&db, &user_id).await.unwrap().queue.is_empty());
    }
}
