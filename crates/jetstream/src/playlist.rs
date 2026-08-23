//! Materializes `app.rocksky.playlist` and `app.rocksky.playlist.song` records
//! into Postgres. This is the *only* way rows land in `playlists`,
//! `playlist_tracks` and `user_playlists` — everything else writes records to a
//! PDS and waits for the commit to come back around through jetstream.

use anyhow::Error;
use chrono::{DateTime, Utc};
use owo_colors::OwoColorize;
use sqlx::{Pool, Postgres};

use crate::{
    profile::did_to_pds,
    repo::save_user,
    subscriber::{PLAYLIST_NSID, PLAYLIST_SONG_NSID},
    types::{PlaylistRecord, PlaylistSongRecord},
};

pub fn playlist_uri(did: &str, rkey: &str) -> String {
    format!("at://{}/{}/{}", did, PLAYLIST_NSID, rkey)
}

pub fn playlist_song_uri(did: &str, rkey: &str) -> String {
    format!("at://{}/{}/{}", did, PLAYLIST_SONG_NSID, rkey)
}

/// The repo (DID) an AT-URI addresses: the authority of `at://<did>/<nsid>/<rkey>`.
fn at_uri_repo(uri: &str) -> Option<&str> {
    uri.strip_prefix("at://")?.split('/').next()
}

fn parse_timestamp(value: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(value)
        .map(|d| d.with_timezone(&Utc))
        .unwrap_or_else(|_| Utc::now())
}

struct PlaylistRow {
    id: String,
    owner_did: String,
    collaborators: Vec<String>,
}

/// Upserts a playlist keyed on its AT-URI, and links it to its owner.
pub async fn save_playlist(
    pool: &Pool<Postgres>,
    nc: &async_nats::Client,
    did: &str,
    rkey: &str,
    cid: Option<&str>,
    record: PlaylistRecord,
) -> Result<(), Error> {
    let user_id = save_user(pool, did).await?;
    let uri = playlist_uri(did, rkey);

    tracing::info!(name = %record.name.magenta(), uri = %uri, "Saving playlist");

    let mut tx = pool.begin().await?;

    // ON CONFLICT (uri) makes create and update the same statement: a record
    // update is just a re-publish of the same AT-URI. created_by is deliberately
    // not in the SET list — the repo that authored the record owns it forever,
    // and a conflicting uri necessarily belongs to the same repo anyway.
    let playlist_id: String = sqlx::query_scalar(
        r#"
    INSERT INTO playlists (
      name, description, picture, uri, cid, collaborators,
      spotify_link, tidal_link, apple_music_link, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (uri) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      picture = EXCLUDED.picture,
      cid = EXCLUDED.cid,
      collaborators = EXCLUDED.collaborators,
      spotify_link = EXCLUDED.spotify_link,
      tidal_link = EXCLUDED.tidal_link,
      apple_music_link = EXCLUDED.apple_music_link,
      xata_updatedat = now()
    RETURNING xata_id
  "#,
    )
    .bind(&record.name)
    .bind(&record.description)
    .bind(&record.picture_url)
    .bind(&uri)
    .bind(cid)
    .bind(record.collaborators.as_deref())
    .bind(&record.spotify_link)
    .bind(&record.tidal_link)
    .bind(&record.apple_music_link)
    .bind(&user_id)
    .fetch_one(&mut *tx)
    .await?;

    sqlx::query(
        r#"
    INSERT INTO user_playlists (user_id, playlist_id, uri)
    VALUES ($1, $2, $3)
    ON CONFLICT (user_id, playlist_id) DO NOTHING
  "#,
    )
    .bind(&user_id)
    .bind(&playlist_id)
    .bind(&uri)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    nc.publish("rocksky.playlist.indexed", playlist_id.into())
        .await?;
    nc.flush().await?;

    Ok(())
}

/// Loads the playlist a `playlist.song` record points at, fetching and
/// materializing it from the owner's PDS if we haven't seen it yet.
///
/// The fetch matters because commit ordering isn't guaranteed across repos: an
/// entry added by a collaborator can reach us before we've ever indexed the
/// owner's playlist, and dropping it would lose the entry permanently.
async fn resolve_playlist(
    pool: &Pool<Postgres>,
    nc: &async_nats::Client,
    playlist_uri: &str,
) -> Result<Option<PlaylistRow>, Error> {
    if let Some(row) = load_playlist(pool, playlist_uri).await? {
        return Ok(Some(row));
    }

    let Some(owner_did) = at_uri_repo(playlist_uri) else {
        tracing::warn!(uri = %playlist_uri, "Playlist ref is not a valid AT-URI");
        return Ok(None);
    };
    let Some(rkey) = playlist_uri.rsplit('/').next() else {
        return Ok(None);
    };

    tracing::info!(uri = %playlist_uri, "Playlist not indexed yet, fetching from PDS");

    let pds = did_to_pds(owner_did).await?;
    let response = reqwest::Client::new()
        .get(format!(
            "{}/xrpc/com.atproto.repo.getRecord?repo={}&collection={}&rkey={}",
            pds, owner_did, PLAYLIST_NSID, rkey
        ))
        .header("Accept", "application/json")
        .send()
        .await?;

    if !response.status().is_success() {
        tracing::warn!(uri = %playlist_uri, status = %response.status(), "Could not fetch playlist record");
        return Ok(None);
    }

    let body: serde_json::Value = response.json().await?;
    let record: PlaylistRecord = serde_json::from_value(body["value"].clone())?;
    let cid = body["cid"].as_str();

    save_playlist(pool, nc, owner_did, rkey, cid, record).await?;

    load_playlist(pool, playlist_uri).await
}

async fn load_playlist(pool: &Pool<Postgres>, uri: &str) -> Result<Option<PlaylistRow>, Error> {
    let row: Option<(String, String, Option<Vec<String>>)> = sqlx::query_as(
        r#"
    SELECT playlists.xata_id, users.did, playlists.collaborators
    FROM playlists
    JOIN users ON users.xata_id = playlists.created_by
    WHERE playlists.uri = $1
  "#,
    )
    .bind(uri)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|(id, owner_did, collaborators)| PlaylistRow {
        id,
        owner_did,
        collaborators: collaborators.unwrap_or_default(),
    }))
}

/// Anyone can write an `app.rocksky.playlist.song` record into their own repo
/// naming *any* playlist AT-URI — nothing at the PDS layer stops it. Honouring
/// such a record blindly would let a stranger push songs into someone else's
/// playlist, so the appview treats an entry as authoritative only when the repo
/// that authored it either owns the playlist, or is listed in the playlist's
/// `collaborators`. That grant lives in the owner's repo, so a would-be
/// injector cannot forge it in their own.
fn authorize_entry(playlist: &PlaylistRow, author_did: &str) -> bool {
    playlist.owner_did == author_did || playlist.collaborators.iter().any(|did| did == author_did)
}

/// Upserts a playlist entry keyed on the entry record's own AT-URI.
pub async fn save_playlist_song(
    pool: &Pool<Postgres>,
    nc: &async_nats::Client,
    did: &str,
    rkey: &str,
    cid: Option<&str>,
    record: PlaylistSongRecord,
) -> Result<(), Error> {
    let uri = playlist_song_uri(did, rkey);

    let Some(playlist) = resolve_playlist(pool, nc, &record.playlist.uri).await? else {
        tracing::warn!(uri = %uri, playlist = %record.playlist.uri, "Unknown playlist, dropping entry");
        return Ok(());
    };

    if !authorize_entry(&playlist, did) {
        tracing::warn!(
            uri = %uri,
            playlist = %record.playlist.uri,
            author = %did,
            owner = %playlist.owner_did,
            "Rejected playlist entry: author is neither the playlist owner nor a collaborator"
        );
        return Ok(());
    }

    let user_id = save_user(pool, did).await?;

    let mut tx = pool.begin().await?;
    let track_id = resolve_track(&mut tx, &record).await?;

    tracing::info!(
        title = %record.title.magenta(),
        playlist = %record.playlist.uri,
        "Saving playlist entry"
    );

    sqlx::query(
        r#"
    INSERT INTO playlist_tracks (
      playlist_id, track_id, uri, cid, added_by, added_at
    ) VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (uri) DO UPDATE SET
      playlist_id = EXCLUDED.playlist_id,
      track_id = EXCLUDED.track_id,
      cid = EXCLUDED.cid,
      added_at = EXCLUDED.added_at
  "#,
    )
    .bind(&playlist.id)
    .bind(&track_id)
    .bind(&uri)
    .bind(cid)
    .bind(&user_id)
    .bind(parse_timestamp(&record.added_at))
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    nc.publish("rocksky.playlist.indexed", playlist.id.into())
        .await?;
    nc.flush().await?;

    Ok(())
}

/// Resolves the entry's song ref to a `tracks` row: by the song record's AT-URI
/// first, then by the content hash of the denormalized metadata, inserting from
/// that metadata as a last resort. The metadata is in the record precisely so an
/// entry stays resolvable when we have never ingested the song itself.
async fn resolve_track(
    tx: &mut sqlx::Transaction<'_, Postgres>,
    record: &PlaylistSongRecord,
) -> Result<String, Error> {
    if let Some(id) =
        sqlx::query_scalar::<_, String>("SELECT xata_id FROM tracks WHERE uri = $1 LIMIT 1")
            .bind(&record.song.uri)
            .fetch_optional(&mut **tx)
            .await?
    {
        return Ok(id);
    }

    let hash = sha256::digest(
        format!("{} - {} - {}", record.title, record.artist, record.album).to_lowercase(),
    );

    if let Some(id) =
        sqlx::query_scalar::<_, String>("SELECT xata_id FROM tracks WHERE sha256 = $1 LIMIT 1")
            .bind(&hash)
            .fetch_optional(&mut **tx)
            .await?
    {
        return Ok(id);
    }

    let id: String = sqlx::query_scalar(
        r#"
    INSERT INTO tracks (title, artist, album, album_artist, album_art, duration, sha256, uri)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (sha256) DO UPDATE SET sha256 = tracks.sha256
    RETURNING xata_id
  "#,
    )
    .bind(&record.title)
    .bind(&record.artist)
    .bind(&record.album)
    .bind(&record.album_artist)
    .bind(&record.album_art_url)
    .bind(record.duration)
    .bind(&hash)
    .bind(&record.song.uri)
    .fetch_one(&mut **tx)
    .await?;

    Ok(id)
}

/// Removing the playlist record removes the playlist. Entries go with it —
/// they are only reachable through the playlist, and leaving them behind would
/// strand rows that no record backs.
pub async fn delete_playlist(pool: &Pool<Postgres>, uri: &str) -> Result<(), Error> {
    let mut tx = pool.begin().await?;

    let playlist_id: Option<String> =
        sqlx::query_scalar("SELECT xata_id FROM playlists WHERE uri = $1")
            .bind(uri)
            .fetch_optional(&mut *tx)
            .await?;

    let Some(playlist_id) = playlist_id else {
        tx.rollback().await?;
        return Ok(());
    };

    sqlx::query("DELETE FROM playlist_tracks WHERE playlist_id = $1")
        .bind(&playlist_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM user_playlists WHERE playlist_id = $1")
        .bind(&playlist_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM playlists WHERE xata_id = $1")
        .bind(&playlist_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    tracing::info!(uri = %uri, "Playlist deleted");
    Ok(())
}

/// The entry's AT-URI encodes the repo that authored it, so deleting by URI can
/// only ever remove a row that repo created — no ownership check needed.
pub async fn delete_playlist_song(pool: &Pool<Postgres>, uri: &str) -> Result<(), Error> {
    let deleted = sqlx::query("DELETE FROM playlist_tracks WHERE uri = $1")
        .bind(uri)
        .execute(pool)
        .await?
        .rows_affected();

    if deleted > 0 {
        tracing::info!(uri = %uri, "Playlist entry deleted");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn playlist(owner: &str, collaborators: &[&str]) -> PlaylistRow {
        PlaylistRow {
            id: "rec_1".to_string(),
            owner_did: owner.to_string(),
            collaborators: collaborators.iter().map(|s| s.to_string()).collect(),
        }
    }

    #[test]
    fn at_uri_repo_extracts_the_authority() {
        assert_eq!(
            at_uri_repo("at://did:plc:abc/app.rocksky.playlist/3kx1"),
            Some("did:plc:abc")
        );
        assert_eq!(at_uri_repo("https://example.com/x"), None);
    }

    #[test]
    fn owner_may_add_entries() {
        assert!(authorize_entry(
            &playlist("did:plc:owner", &[]),
            "did:plc:owner"
        ));
    }

    #[test]
    fn stranger_may_not_add_entries() {
        assert!(!authorize_entry(
            &playlist("did:plc:owner", &[]),
            "did:plc:stranger"
        ));
    }

    #[test]
    fn declared_collaborator_may_add_entries() {
        assert!(authorize_entry(
            &playlist("did:plc:owner", &["did:plc:friend"]),
            "did:plc:friend"
        ));
    }

    #[test]
    fn collaborator_of_another_playlist_may_not_add_entries() {
        assert!(!authorize_entry(
            &playlist("did:plc:owner", &["did:plc:friend"]),
            "did:plc:someone-else"
        ));
    }
}
