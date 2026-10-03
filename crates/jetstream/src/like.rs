//! Materializes `app.rocksky.like` records into `loved_tracks`. This is the
//! only writer of that table: the API puts the record in the liker's repo and
//! the row lands here when the commit comes back through jetstream.
//!
//! Likes on shouts share the collection but live in `shout_likes`, which the
//! API still writes itself, so only song subjects are handled.

use anyhow::Error;
use chrono::{DateTime, Utc};
use rocksky_db::exec as sql;
use rocksky_db::Backend;
use sea_query::{Expr, OnConflict, Query};
use serde_json::json;

use crate::{
    profile::did_to_pds,
    repo::save_user,
    schema::{LovedTracks, Tracks, UserTracks},
    subscriber::{LIKE_NSID, SONG_NSID},
    types::LikeRecord,
};

pub fn like_uri(did: &str, rkey: &str) -> String {
    format!("at://{}/{}/{}", did, LIKE_NSID, rkey)
}

/// `(repo, collection, rkey)` of `at://<repo>/<collection>/<rkey>`.
fn split_at_uri(uri: &str) -> Option<(&str, &str, &str)> {
    let mut parts = uri.strip_prefix("at://")?.splitn(3, '/');
    Some((parts.next()?, parts.next()?, parts.next()?))
}

fn parse_timestamp(value: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(value)
        .map(|d| d.with_timezone(&Utc))
        .unwrap_or_else(|_| Utc::now())
}

/// The payload subscribers of `rocksky.like` / `rocksky.unlike` read — the
/// Xata-era row shape the API used to publish.
fn event_payload(
    id: &str,
    uri: &str,
    user_id: &str,
    track_id: &str,
    created_at: DateTime<Utc>,
) -> String {
    json!({
        "uri": uri,
        "user_id": { "xata_id": user_id },
        "track_id": { "xata_id": track_id },
        "xata_createdat": created_at.to_rfc3339(),
        "xata_id": id,
        "xata_updatedat": created_at.to_rfc3339(),
        "xata_version": 0,
    })
    .to_string()
}

pub async fn save_like(
    pool: &Backend,
    nc: &async_nats::Client,
    did: &str,
    rkey: &str,
    record: LikeRecord,
) -> Result<(), Error> {
    let uri = like_uri(did, rkey);
    let user_id = save_user(pool, did).await?;

    let Some((_, collection, _)) = split_at_uri(&record.subject.uri) else {
        tracing::warn!(uri = %uri, subject = %record.subject.uri, "Like subject is not an AT-URI");
        return Ok(());
    };
    if collection != SONG_NSID {
        return Ok(());
    }

    let Some(track_id) = resolve_track(pool, &record.subject.uri).await? else {
        tracing::warn!(uri = %uri, subject = %record.subject.uri, "Liked song not found, dropping like");
        return Ok(());
    };

    let created_at = parse_timestamp(&record.created_at);

    let mut tx = pool.begin().await?;

    let existing = Query::select()
        .columns([LovedTracks::XataId, LovedTracks::Uri])
        .from(LovedTracks::Table)
        .and_where(Expr::col(LovedTracks::UserId).eq(&user_id))
        .and_where(Expr::col(LovedTracks::TrackId).eq(&track_id))
        .limit(1)
        .take();

    if let Some((id, existing_uri)) = tx
        .fetch_optional::<(String, Option<String>)>(&existing)
        .await?
    {
        // Already loved: point the row at this record so deleting it unlikes.
        if existing_uri.as_deref() != Some(uri.as_str()) {
            let relink = Query::update()
                .table(LovedTracks::Table)
                .value(LovedTracks::Uri, uri.clone())
                .and_where(Expr::col(LovedTracks::XataId).eq(id))
                .to_owned();
            tx.execute(&relink).await?;
        }
        tx.commit().await?;
        return Ok(());
    }

    let insert = Query::insert()
        .into_table(LovedTracks::Table)
        .columns([
            LovedTracks::XataId,
            LovedTracks::UserId,
            LovedTracks::TrackId,
            LovedTracks::Uri,
            LovedTracks::XataCreatedat,
        ])
        .values_panic([
            rocksky_db::new_id().into(),
            user_id.clone().into(),
            track_id.clone().into(),
            uri.clone().into(),
            created_at.into(),
        ])
        .on_conflict(OnConflict::column(LovedTracks::Uri).do_nothing().to_owned())
        .returning_col(LovedTracks::XataId)
        .to_owned();

    let id: Option<String> = tx.fetch_scalar(&insert).await?;
    tx.commit().await?;

    let Some(id) = id else {
        return Ok(());
    };

    tracing::info!(uri = %uri, track_id = %track_id, "Saved like");

    nc.publish(
        "rocksky.like",
        event_payload(&id, &uri, &user_id, &track_id, created_at).into(),
    )
    .await?;
    nc.flush().await?;

    Ok(())
}

pub async fn delete_like(
    pool: &Backend,
    nc: &async_nats::Client,
    did: &str,
    rkey: &str,
) -> Result<(), Error> {
    let uri = like_uri(did, rkey);

    let select = Query::select()
        .columns([
            LovedTracks::XataId,
            LovedTracks::UserId,
            LovedTracks::TrackId,
            LovedTracks::XataCreatedat,
        ])
        .from(LovedTracks::Table)
        .and_where(Expr::col(LovedTracks::Uri).eq(&uri))
        .take();

    let Some((id, user_id, track_id, created_at)) =
        sql::fetch_optional::<(String, String, String, DateTime<Utc>)>(pool, &select).await?
    else {
        return Ok(());
    };

    let delete = Query::delete()
        .from_table(LovedTracks::Table)
        .and_where(Expr::col(LovedTracks::XataId).eq(&id))
        .to_owned();
    sql::execute(pool, &delete).await?;

    tracing::info!(uri = %uri, track_id = %track_id, "Deleted like");

    nc.publish(
        "rocksky.unlike",
        event_payload(&id, &uri, &user_id, &track_id, created_at).into(),
    )
    .await?;
    nc.flush().await?;

    Ok(())
}

/// The `tracks` row a song AT-URI names: the canonical `tracks.uri`, then any
/// user's copy of the song record, then the record itself fetched from its PDS
/// and matched by content hash.
async fn resolve_track(pool: &Backend, song_uri: &str) -> Result<Option<String>, Error> {
    let by_uri = Query::select()
        .column(Tracks::XataId)
        .from(Tracks::Table)
        .and_where(Expr::col(Tracks::Uri).eq(song_uri))
        .limit(1)
        .take();
    if let Some(id) = sql::fetch_scalar_optional::<String>(pool, &by_uri).await? {
        return Ok(Some(id));
    }

    let by_user_track = Query::select()
        .column(UserTracks::TrackId)
        .from(UserTracks::Table)
        .and_where(Expr::col(UserTracks::Uri).eq(song_uri))
        .limit(1)
        .take();
    if let Some(id) = sql::fetch_scalar_optional::<String>(pool, &by_user_track).await? {
        return Ok(Some(id));
    }

    let Some(hash) = fetch_song_hash(song_uri).await? else {
        return Ok(None);
    };
    let by_hash = Query::select()
        .column(Tracks::XataId)
        .from(Tracks::Table)
        .and_where(Expr::col(Tracks::Sha256).eq(hash))
        .limit(1)
        .take();
    Ok(sql::fetch_scalar_optional::<String>(pool, &by_hash).await?)
}

async fn fetch_song_hash(song_uri: &str) -> Result<Option<String>, Error> {
    let Some((repo, collection, rkey)) = split_at_uri(song_uri) else {
        return Ok(None);
    };
    let pds = did_to_pds(repo).await?;
    let response = reqwest::Client::new()
        .get(format!(
            "{}/xrpc/com.atproto.repo.getRecord",
            pds.trim_end_matches('/')
        ))
        .query(&[("repo", repo), ("collection", collection), ("rkey", rkey)])
        .header("Accept", "application/json")
        .send()
        .await?;
    if !response.status().is_success() {
        return Ok(None);
    }
    let body: serde_json::Value = response.json().await?;
    let value = &body["value"];
    let (Some(title), Some(artist), Some(album)) = (
        value["title"].as_str(),
        value["artist"].as_str(),
        value["album"].as_str(),
    ) else {
        return Ok(None);
    };
    Ok(Some(sha256::digest(
        format!("{} - {} - {}", title, artist, album).to_lowercase(),
    )))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_an_at_uri() {
        assert_eq!(
            split_at_uri("at://did:plc:abc/app.rocksky.song/3kx1"),
            Some(("did:plc:abc", "app.rocksky.song", "3kx1"))
        );
        assert_eq!(split_at_uri("https://example.com"), None);
    }
}
