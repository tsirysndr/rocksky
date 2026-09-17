//! Materializes `app.rocksky.playlist` and `app.rocksky.playlist.song` records
//! into Postgres. This is the *only* way rows land in `playlists`,
//! `playlist_tracks` and `user_playlists` — everything else writes records to a
//! PDS and waits for the commit to come back around through jetstream.

use anyhow::Error;
use chrono::{DateTime, Utc};
use owo_colors::OwoColorize;
use rocksky_pgurl::sql;
use sea_query::{Expr, JoinType, OnConflict, Query};
use sqlx::{Pool, Postgres};

use crate::{
    profile::did_to_pds,
    repo::save_user,
    schema::{PlaylistTracks, Playlists, Tracks, UserPlaylists, Users},
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
    let upsert = Query::insert()
        .into_table(Playlists::Table)
        .columns([
            Playlists::Name,
            Playlists::Description,
            Playlists::Picture,
            Playlists::Uri,
            Playlists::Cid,
            Playlists::SpotifyLink,
            Playlists::TidalLink,
            Playlists::AppleMusicLink,
            Playlists::CreatedBy,
        ])
        .values_panic([
            record.name.clone().into(),
            record.description.clone().into(),
            record.picture_url.clone().into(),
            uri.clone().into(),
            cid.map(str::to_string).into(),
            record.spotify_link.clone().into(),
            record.tidal_link.clone().into(),
            record.apple_music_link.clone().into(),
            user_id.clone().into(),
        ])
        .on_conflict(
            OnConflict::column(Playlists::Uri)
                .update_columns([
                    Playlists::Name,
                    Playlists::Description,
                    Playlists::Picture,
                    Playlists::Cid,
                    Playlists::SpotifyLink,
                    Playlists::TidalLink,
                    Playlists::AppleMusicLink,
                ])
                .value(Playlists::XataUpdatedat, Expr::cust("now()"))
                .to_owned(),
        )
        .returning_col(Playlists::XataId)
        .to_owned();

    let playlist_id: String = sql::fetch_scalar(&mut *tx, &upsert).await?;

    let link = Query::insert()
        .into_table(UserPlaylists::Table)
        .columns([
            UserPlaylists::UserId,
            UserPlaylists::PlaylistId,
            UserPlaylists::Uri,
        ])
        .values_panic([
            user_id.clone().into(),
            playlist_id.clone().into(),
            uri.clone().into(),
        ])
        .on_conflict(
            OnConflict::columns([UserPlaylists::UserId, UserPlaylists::PlaylistId])
                .do_nothing()
                .to_owned(),
        )
        .to_owned();

    sql::execute(&mut *tx, &link).await?;

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
/// entry can reach us before we've indexed the playlist it names, and dropping
/// it would lose the entry permanently.
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
    let stmt = Query::select()
        .column((Playlists::Table, Playlists::XataId))
        .column((Users::Table, Users::Did))
        .from(Playlists::Table)
        .join(
            JoinType::Join,
            Users::Table,
            Expr::col((Users::Table, Users::XataId))
                .equals((Playlists::Table, Playlists::CreatedBy)),
        )
        .and_where(Expr::col((Playlists::Table, Playlists::Uri)).eq(uri))
        .take();

    let row: Option<(String, String)> = sql::fetch_optional(pool, &stmt).await?;

    Ok(row.map(|(id, owner_did)| PlaylistRow { id, owner_did }))
}

/// Anyone can write an `app.rocksky.playlist.song` record into their own repo
/// naming *any* playlist AT-URI — nothing at the PDS layer stops it. Honouring
/// such a record blindly would let a stranger push songs into someone else's
/// playlist, so the appview only accepts an entry authored by the repo that
/// owns the playlist.
fn authorize_entry(playlist: &PlaylistRow, author_did: &str) -> bool {
    playlist.owner_did == author_did
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
            "Rejected playlist entry: author does not own the playlist"
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

    let upsert = Query::insert()
        .into_table(PlaylistTracks::Table)
        .columns([
            PlaylistTracks::PlaylistId,
            PlaylistTracks::TrackId,
            PlaylistTracks::Uri,
            PlaylistTracks::Cid,
            PlaylistTracks::AddedBy,
            PlaylistTracks::AddedAt,
        ])
        .values_panic([
            playlist.id.clone().into(),
            track_id.clone().into(),
            uri.clone().into(),
            cid.map(str::to_string).into(),
            user_id.clone().into(),
            parse_timestamp(&record.added_at).into(),
        ])
        .on_conflict(
            OnConflict::column(PlaylistTracks::Uri)
                .update_columns([
                    PlaylistTracks::PlaylistId,
                    PlaylistTracks::TrackId,
                    PlaylistTracks::Cid,
                    PlaylistTracks::AddedAt,
                ])
                .to_owned(),
        )
        .to_owned();

    sql::execute(&mut *tx, &upsert).await?;

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
    let by_uri = Query::select()
        .column(Tracks::XataId)
        .from(Tracks::Table)
        .and_where(Expr::col(Tracks::Uri).eq(&record.song.uri))
        .limit(1)
        .take();

    if let Some(id) = sql::fetch_scalar_optional::<String>(&mut **tx, &by_uri).await? {
        return Ok(id);
    }

    let hash = sha256::digest(
        format!("{} - {} - {}", record.title, record.artist, record.album).to_lowercase(),
    );

    let by_hash = Query::select()
        .column(Tracks::XataId)
        .from(Tracks::Table)
        .and_where(Expr::col(Tracks::Sha256).eq(&hash))
        .limit(1)
        .take();

    if let Some(id) = sql::fetch_scalar_optional::<String>(&mut **tx, &by_hash).await? {
        return Ok(id);
    }

    let insert = Query::insert()
        .into_table(Tracks::Table)
        .columns([
            Tracks::Title,
            Tracks::Artist,
            Tracks::Album,
            Tracks::AlbumArtist,
            Tracks::AlbumArt,
            Tracks::Duration,
            Tracks::Sha256,
            Tracks::Uri,
        ])
        .values_panic([
            record.title.clone().into(),
            record.artist.clone().into(),
            record.album.clone().into(),
            record.album_artist.clone().into(),
            record.album_art_url.clone().into(),
            record.duration.into(),
            hash.clone().into(),
            record.song.uri.clone().into(),
        ])
        .on_conflict(
            OnConflict::column(Tracks::Sha256)
                .value(Tracks::Sha256, Expr::col((Tracks::Table, Tracks::Sha256)))
                .to_owned(),
        )
        .returning_col(Tracks::XataId)
        .to_owned();

    Ok(sql::fetch_scalar(&mut **tx, &insert).await?)
}

/// Removing the playlist record removes the playlist. Entries go with it —
/// they are only reachable through the playlist, and leaving them behind would
/// strand rows that no record backs.
pub async fn delete_playlist(pool: &Pool<Postgres>, uri: &str) -> Result<(), Error> {
    let mut tx = pool.begin().await?;

    let by_uri = Query::select()
        .column(Playlists::XataId)
        .from(Playlists::Table)
        .and_where(Expr::col(Playlists::Uri).eq(uri))
        .take();

    let playlist_id: Option<String> = sql::fetch_scalar_optional(&mut *tx, &by_uri).await?;

    let Some(playlist_id) = playlist_id else {
        tx.rollback().await?;
        return Ok(());
    };

    let entries = Query::delete()
        .from_table(PlaylistTracks::Table)
        .and_where(Expr::col(PlaylistTracks::PlaylistId).eq(&playlist_id))
        .to_owned();
    sql::execute(&mut *tx, &entries).await?;

    let links = Query::delete()
        .from_table(UserPlaylists::Table)
        .and_where(Expr::col(UserPlaylists::PlaylistId).eq(&playlist_id))
        .to_owned();
    sql::execute(&mut *tx, &links).await?;

    let playlist = Query::delete()
        .from_table(Playlists::Table)
        .and_where(Expr::col(Playlists::XataId).eq(&playlist_id))
        .to_owned();
    sql::execute(&mut *tx, &playlist).await?;

    tx.commit().await?;
    tracing::info!(uri = %uri, "Playlist deleted");
    Ok(())
}

/// The entry's AT-URI encodes the repo that authored it, so deleting by URI can
/// only ever remove a row that repo created — no ownership check needed.
pub async fn delete_playlist_song(pool: &Pool<Postgres>, uri: &str) -> Result<(), Error> {
    let delete = Query::delete()
        .from_table(PlaylistTracks::Table)
        .and_where(Expr::col(PlaylistTracks::Uri).eq(uri))
        .to_owned();

    let deleted = sql::execute(pool, &delete).await?.rows_affected();

    if deleted > 0 {
        tracing::info!(uri = %uri, "Playlist entry deleted");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn playlist(owner: &str) -> PlaylistRow {
        PlaylistRow {
            id: "rec_1".to_string(),
            owner_did: owner.to_string(),
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
        assert!(authorize_entry(&playlist("did:plc:owner"), "did:plc:owner"));
    }

    #[test]
    fn stranger_may_not_add_entries() {
        assert!(!authorize_entry(
            &playlist("did:plc:owner"),
            "did:plc:stranger"
        ));
    }
}
