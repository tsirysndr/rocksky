use std::collections::HashMap;
use std::sync::{Arc, OnceLock, RwLock};

use anyhow::Error;
use chrono::DateTime;
use owo_colors::OwoColorize;
use rocksky_db::exec as sql;
use rocksky_db::Backend;
use sea_query::{Alias, Asterisk, Cond, Expr, Func, OnConflict, Order, Query, SelectStatement};
use serde_json::json;
use tokio::sync::Mutex;

use crate::schema::{
    AlbumTracks, Albums, ArtistAlbums, ArtistTracks, Artists, Feeds, Follows, Scrobbles, Tracks,
    UserAlbums, UserArtists, UserTracks, Users,
};

// In-memory did → users.xata_id cache. Saves both the SELECT and the
// did_to_profile HTTPS roundtrip on every scrobble for an existing user
// (which is ~all scrobbles). xata_id is immutable for a user, so the
// cache never goes stale; entries only need eviction if a user is deleted,
// which we don't currently support.
static USER_ID_CACHE: OnceLock<RwLock<HashMap<String, String>>> = OnceLock::new();

fn user_id_cache() -> &'static RwLock<HashMap<String, String>> {
    USER_ID_CACHE.get_or_init(|| RwLock::new(HashMap::new()))
}

use crate::{
    playlist,
    profile::did_to_profile,
    subscriber::{
        ALBUM_NSID, ARTIST_NSID, FEED_GENERATOR_NSID, FOLLOW_NSID, PLAYLIST_NSID,
        PLAYLIST_SONG_NSID, SCROBBLE_NSID, SONG_NSID,
    },
    types::{
        AlbumRecord, ArtistRecord, Commit, FeedGeneratorRecord, FollowRecord, PlaylistRecord,
        PlaylistSongRecord, ScrobbleRecord, SongRecord,
    },
    webhook::discord::{
        self,
        model::{ScrobbleData, WebhookEnvelope},
    },
    webhook_worker::{push_to_queue, AppState},
    xata::{
        album_track::AlbumTrack, artist_album::ArtistAlbum, artist_track::ArtistTrack,
        track::Track, user::User, user_album::UserAlbum, user_artist::UserArtist,
        user_track::UserTrack,
    },
};

pub async fn save_scrobble(
    state: Arc<Mutex<AppState>>,
    pool: Arc<Backend>,
    nc: Arc<async_nats::Client>,
    did: &str,
    commit: Commit,
) -> Result<(), Error> {
    // skip unknown collection
    if !vec![
        SCROBBLE_NSID,
        ARTIST_NSID,
        ALBUM_NSID,
        SONG_NSID,
        FEED_GENERATOR_NSID,
        FOLLOW_NSID,
        PLAYLIST_NSID,
        PLAYLIST_SONG_NSID,
    ]
    .contains(&commit.collection.as_str())
    {
        return Ok(());
    }

    match commit.operation.as_str() {
        "create" => {
            let record = commit.record.unwrap();
            if commit.collection == SCROBBLE_NSID {
                let scrobble_record: ScrobbleRecord = serde_json::from_value(record.clone())?;
                let user_id = save_user(&*pool, did).await?;

                let mut tx = pool.begin().await?;

                let album_id = save_album(&mut tx, scrobble_record.clone()).await?;
                let artist_id = save_artist(&mut tx, scrobble_record.clone()).await?;
                let track_id = save_track(&mut tx, scrobble_record.clone()).await?;

                save_album_track(&mut tx, &album_id, &track_id).await?;
                save_artist_track(&mut tx, &artist_id, &track_id).await?;
                save_artist_album(&mut tx, &artist_id, &album_id).await?;

                let uri = format!("at://{}/app.rocksky.scrobble/{}", did, commit.rkey);

                tracing::info!(title = %scrobble_record.title.magenta(), artist = %scrobble_record.artist.magenta(), album = %scrobble_record.album.magenta(), "Saving scrobble");

                // ON CONFLICT on the (user, track, timestamp) composite drops the
                // race between concurrent sources (Spotify webhook, Last.fm mirror,
                // Navidrome, etc.) that each publish their own at-uri for the same
                // listen. RETURNING is empty on conflict — that's the signal to
                // skip the downstream fan-out (NATS + Discord) so we don't double-
                // fire for what is, by definition, the same scrobble.
                let insert = Query::insert()
                    .into_table(Scrobbles::Table)
                    .columns([
                        Scrobbles::XataId,
                        Scrobbles::AlbumId,
                        Scrobbles::ArtistId,
                        Scrobbles::TrackId,
                        Scrobbles::Uri,
                        Scrobbles::UserId,
                        Scrobbles::Timestamp,
                    ])
                    .values_panic([
                        rocksky_db::new_id().into(),
                        album_id.into(),
                        artist_id.into(),
                        track_id.into(),
                        uri.into(),
                        user_id.clone().into(),
                        DateTime::parse_from_rfc3339(&scrobble_record.created_at)
                            .unwrap()
                            .with_timezone(&chrono::Utc)
                            .into(),
                    ])
                    .on_conflict(
                        OnConflict::columns([
                            Scrobbles::UserId,
                            Scrobbles::TrackId,
                            Scrobbles::Timestamp,
                        ])
                        .do_nothing()
                        .to_owned(),
                    )
                    .returning_col(Scrobbles::XataId)
                    .to_owned();

                let scrobble_id: Option<String> = tx.fetch_scalar(&insert).await?;

                tx.commit().await?;

                let Some(scrobble_id) = scrobble_id else {
                    tracing::info!(
                        title = %scrobble_record.title.magenta(),
                        artist = %scrobble_record.artist.magenta(),
                        did = %did,
                        "Duplicate scrobble (same user/track/timestamp) — skipping publish"
                    );
                    return Ok(());
                };

                nc.publish("rocksky.scrobble.new", scrobble_id.into())
                    .await?;
                publish_user(&nc, &pool, &user_id).await?;

                let users: Vec<User> = sql::fetch_all(
                    &*pool,
                    &Query::select()
                        .column(Asterisk)
                        .from(Users::Table)
                        .and_where(Expr::col(Users::Did).eq(did))
                        .take(),
                )
                .await?;

                if users.is_empty() {
                    return Err(anyhow::anyhow!(
                        "User with DID {} not found in database",
                        did
                    ));
                }

                // Push to webhook queue (Discord)
                match push_to_queue(
                    state,
                    &WebhookEnvelope {
                        r#type: "scrobble.created".to_string(),
                        id: commit.rkey.clone(),
                        data: ScrobbleData {
                            user: discord::model::User {
                                did: did.to_string(),
                                display_name: users[0].display_name.clone(),
                                handle: users[0].handle.clone(),
                                avatar_url: users[0].avatar.clone(),
                            },
                            track: discord::model::Track {
                                title: scrobble_record.title.clone(),
                                artist: scrobble_record.artist.clone(),
                                album: scrobble_record.album.clone(),
                                duration: scrobble_record.duration,
                                artwork_url: scrobble_record.album_art_url.clone(),
                                spotify_url: scrobble_record.spotify_link.clone(),
                                tidal_url: scrobble_record.tidal_link.clone(),
                                youtube_url: scrobble_record.youtube_link.clone(),
                            },
                            played_at: scrobble_record.created_at.clone(),
                        },
                        delivered_at: Some(chrono::Utc::now().to_rfc3339()),
                    },
                )
                .await
                {
                    Ok(_) => {}
                    Err(e) => {
                        tracing::error!(error = %e, "Failed to push to webhook queue");
                    }
                }
            }

            if commit.collection == ARTIST_NSID {
                let artist_record: ArtistRecord = serde_json::from_value(record.clone())?;
                let user_id = save_user(&*pool, did).await?;
                let mut tx = pool.begin().await?;
                let uri = format!("at://{}/app.rocksky.artist/{}", did, commit.rkey);

                save_user_artist(&mut tx, &user_id, artist_record.clone(), &uri).await?;
                update_artist_uri(&mut tx, &user_id, artist_record, &uri).await?;

                tx.commit().await?;
                publish_user(&nc, &pool, &user_id).await?;
            }

            if commit.collection == ALBUM_NSID {
                let album_record: AlbumRecord = serde_json::from_value(record.clone())?;
                let user_id = save_user(&*pool, did).await?;
                let mut tx = pool.begin().await?;
                let uri = format!("at://{}/app.rocksky.album/{}", did, commit.rkey);

                save_user_album(&mut tx, &user_id, album_record.clone(), &uri).await?;
                update_album_uri(&mut tx, &user_id, album_record, &uri).await?;

                tx.commit().await?;
                publish_user(&nc, &pool, &user_id).await?;
            }

            if commit.collection == SONG_NSID {
                let song_record: SongRecord = serde_json::from_value(record.clone())?;
                let user_id = save_user(&*pool, did).await?;
                let mut tx = pool.begin().await?;
                let uri = format!("at://{}/app.rocksky.song/{}", did, commit.rkey);

                save_user_track(&mut tx, &user_id, song_record.clone(), &uri).await?;
                update_track_uri(&mut tx, &user_id, song_record, &uri).await?;

                tx.commit().await?;
                publish_user(&nc, &pool, &user_id).await?;
            }

            if commit.collection == FEED_GENERATOR_NSID {
                let feed_generator_record: FeedGeneratorRecord =
                    serde_json::from_value(record.clone())?;
                let user_id = save_user(&*pool, did).await?;
                let mut tx = pool.begin().await?;
                let uri = format!("at://{}/app.rocksky.feed.generator/{}", did, commit.rkey);

                save_feed_generator(&mut tx, &user_id, feed_generator_record, &uri).await?;

                tx.commit().await?;
                publish_user(&nc, &pool, &user_id).await?;
            }

            if commit.collection == FOLLOW_NSID {
                let follow_record: FollowRecord = serde_json::from_value(record.clone())?;
                let user_id = save_user(&*pool, did).await?;
                let subject_user_id = save_user(&*pool, &follow_record.subject).await?;
                let mut tx = pool.begin().await?;
                let uri = format!("at://{}/app.rocksky.graph.follow/{}", did, commit.rkey);

                save_follow(&mut tx, did, follow_record, &uri).await?;

                tx.commit().await?;
                publish_user(&nc, &pool, &user_id).await?;
                publish_user(&nc, &pool, &subject_user_id).await?;
            }

            if commit.collection == PLAYLIST_NSID || commit.collection == PLAYLIST_SONG_NSID {
                save_playlist_commit(
                    &pool,
                    &nc,
                    did,
                    &commit.collection,
                    &commit.rkey,
                    commit.cid.as_deref(),
                    record,
                )
                .await?;
            }
        }
        // Playlists are the only collection whose records are edited in place —
        // renaming one, or re-adding a song, republishes the same AT-URI. The
        // rest are append-only, so an update event on them is nothing to act on.
        "update" => {
            if commit.collection == PLAYLIST_NSID || commit.collection == PLAYLIST_SONG_NSID {
                let Some(record) = commit.record.clone() else {
                    tracing::warn!(collection = %commit.collection, "Update commit carried no record");
                    return Ok(());
                };
                save_playlist_commit(
                    &pool,
                    &nc,
                    did,
                    &commit.collection,
                    &commit.rkey,
                    commit.cid.as_deref(),
                    record,
                )
                .await?;
            } else {
                tracing::warn!(operation = %commit.operation, collection = %commit.collection, "Update operation not implemented for this collection");
            }
        }
        "delete" => {
            if commit.collection == SCROBBLE_NSID {
                let uri = format!("at://{}/app.rocksky.scrobble/{}", did, commit.rkey);
                match delete_scrobble(&pool, &uri).await {
                    Ok(_) => {
                        nc.publish("rocksky.delete.scrobble", uri.into()).await?;
                        nc.flush().await?;
                        tracing::info!(operation = %commit.operation, collection = %commit.collection, "Scrobble deleted");
                    }
                    Err(e) => {
                        tracing::error!(error = %e, operation = %commit.operation, collection = %commit.collection, "Failed to delete scrobble");
                    }
                }
            } else if commit.collection == PLAYLIST_NSID {
                let uri = playlist::playlist_uri(did, &commit.rkey);
                playlist::delete_playlist(&pool, &uri).await?;
                nc.publish("rocksky.delete.playlist", uri.into()).await?;
                nc.flush().await?;
            } else if commit.collection == PLAYLIST_SONG_NSID {
                let uri = playlist::playlist_song_uri(did, &commit.rkey);
                playlist::delete_playlist_song(&pool, &uri).await?;
            } else {
                tracing::warn!(operation = %commit.operation, collection = %commit.collection, "Delete operation not implemented for this collection");
            }
        }
        _ => {
            tracing::warn!(operation = %commit.operation, "Unsupported operation");
        }
    }
    Ok(())
}

/// Create and update are the same write for playlist records: both carry the
/// full record, and both upsert on the record's AT-URI.
async fn save_playlist_commit(
    pool: &Backend,
    nc: &async_nats::Client,
    did: &str,
    collection: &str,
    rkey: &str,
    cid: Option<&str>,
    record: serde_json::Value,
) -> Result<(), Error> {
    if collection == PLAYLIST_NSID {
        let playlist_record: PlaylistRecord = serde_json::from_value(record)?;
        playlist::save_playlist(pool, nc, did, rkey, cid, playlist_record).await
    } else {
        let song_record: PlaylistSongRecord = serde_json::from_value(record)?;
        playlist::save_playlist_song(pool, nc, did, rkey, cid, song_record).await
    }
}

pub async fn save_user(pool: &Backend, did: &str) -> Result<String, Error> {
    if let Some(id) = user_id_cache().read().unwrap().get(did).cloned() {
        return Ok(id);
    }

    let by_did = Query::select()
        .column(Users::XataId)
        .from(Users::Table)
        .and_where(Expr::col(Users::Did).eq(did))
        .take();

    if let Some(id) = sql::fetch_scalar_optional::<String>(pool, &by_did).await? {
        user_id_cache()
            .write()
            .unwrap()
            .insert(did.to_string(), id.clone());
        return Ok(id);
    }

    let profile = did_to_profile(did).await?;

    let avatar = profile.avatar.map(|blob| {
        format!(
            "https://cdn.bsky.app/img/avatar/plain/{}/{}@{}",
            did,
            blob.r#ref.link,
            blob.mime_type.split('/').last().unwrap_or("jpeg")
        )
    });

    // DO UPDATE SET did = users.did is a no-op write that forces RETURNING to
    // fire on conflict, so two parallel inserts of the same DID both get back
    // the existing xata_id instead of one needing a follow-up SELECT.
    let insert = Query::insert()
        .into_table(Users::Table)
        .columns([
            Users::XataId,
            Users::DisplayName,
            Users::Did,
            Users::Handle,
            Users::Avatar,
        ])
        .values_panic([
            rocksky_db::new_id().into(),
            profile.display_name.into(),
            did.into(),
            profile.handle.into(),
            avatar.into(),
        ])
        .on_conflict(
            OnConflict::column(Users::Did)
                .value(Users::Did, Expr::col((Users::Table, Users::Did)))
                .to_owned(),
        )
        .returning_col(Users::XataId)
        .to_owned();

    let id: String = sql::fetch_scalar(pool, &insert).await?;

    user_id_cache()
        .write()
        .unwrap()
        .insert(did.to_string(), id.clone());
    Ok(id)
}

pub async fn publish_user(nc: &async_nats::Client, pool: &Backend, id: &str) -> Result<(), Error> {
    let users: Vec<User> = sql::fetch_all(
        pool,
        &Query::select()
            .column(Asterisk)
            .from(Users::Table)
            .and_where(Expr::col(Users::XataId).eq(id))
            .take(),
    )
    .await?;

    if users.is_empty() {
        tracing::warn!(user=%id, "user not found");
        return Ok(());
    }

    let u = &users[0];

    let payload = json!({
        "xata_id": u.xata_id,
        "did": u.did,
        "handle": u.handle,
        "display_name": u.display_name,
        "avatar": u.avatar,
        "xata_createdat": u.xata_createdat.to_rfc3339(),
        "xata_updatedat": u.xata_createdat.to_rfc3339(),
        "xata_version": 0,
    });
    let payload = serde_json::to_string(&payload)?;

    nc.publish("rocksky.user", payload.into()).await?;
    nc.flush().await?;

    Ok(())
}

/// `ON CONFLICT (<key>) DO UPDATE SET <key> = <table>.<key>` — a no-op write
/// whose only job is to make `RETURNING` fire on conflict, so a concurrent
/// insert of the same row gives us back its id instead of needing a follow-up
/// SELECT.
fn keep_existing(
    table: impl sea_query::IntoIden + Copy + 'static,
    key: impl sea_query::IntoIden + Copy + 'static,
) -> OnConflict {
    OnConflict::column(key)
        .value(key, Expr::col((table, key)))
        .to_owned()
}

/// `SELECT * FROM <table> WHERE sha256 = <hash>` — how every catalogue row is
/// looked up before it is inserted.
/// The id of the row with this content hash.
///
/// One column, not `SELECT *`: every caller of this is a find-or-create that
/// needs only the id. Narrowing it also keeps `artists.genres` out of the
/// result — a `text[]` on Postgres and a JSON array in TEXT on SQLite, which
/// decodes into `Vec<String>` from neither, so selecting it at all would tie
/// this lookup to one backend.
fn id_by_sha256(table: impl sea_query::IntoTableRef, hash: &str) -> SelectStatement {
    Query::select()
        .column(Alias::new("xata_id"))
        .from(table)
        .and_where(Expr::col(Alias::new("sha256")).eq(hash))
        .take()
}

/// The `tracks` row a scrobble or song record refers to, by content hash first.
///
/// Falls back to MBID and then ISRC when the source supplied one — that covers
/// cosmetic title variations between scrobble sources that the sha256 would
/// miss. The ranking is what matters: the same ISRC can map to several `tracks`
/// rows when one recording is released on more than one album (a single and a
/// compilation, say), so an unranked `OR ... LIMIT 1` returns a
/// non-deterministic row that can silently cross albums.
///
/// The `$n::text IS NOT NULL` guards the hand-written form needed are gone — a
/// branch with no value is simply not added.
fn track_by_hash_or_id(hash: &str, mb_id: Option<&str>, isrc: Option<&str>) -> SelectStatement {
    let by_sha = || Expr::col(Tracks::Sha256).eq(hash);
    let by_mb = |v: &str| Expr::col(Tracks::MbId).eq(v);
    let by_isrc = |v: &str| Expr::col(Tracks::Isrc).eq(v);

    let mut matches = Cond::any().add(by_sha());
    let mut rank = Expr::case(by_sha(), 0);
    if let Some(v) = mb_id {
        matches = matches.add(by_mb(v));
        rank = rank.case(by_mb(v), 1);
    }
    if let Some(v) = isrc {
        matches = matches.add(by_isrc(v));
        rank = rank.case(by_isrc(v), 2);
    }

    Query::select()
        .column(Asterisk)
        .from(Tracks::Table)
        .cond_where(matches)
        .order_by_expr(rank.finally(3).into(), Order::Asc)
        .limit(1)
        .take()
}

/// `scrobbles = scrobbles + 1, uri = <uri>` on the caller's row in one of the
/// three per-user rollup tables.
fn bump_scrobbles(
    table: impl sea_query::IntoTableRef,
    scrobbles: impl sea_query::IntoIden + Copy + 'static,
    uri_col: impl sea_query::IntoIden,
    uri: &str,
    predicate: sea_query::SimpleExpr,
) -> sea_query::UpdateStatement {
    Query::update()
        .table(table)
        .value(scrobbles, Expr::col(scrobbles).add(1))
        .value(uri_col, uri)
        .and_where(predicate)
        .to_owned()
}

pub async fn save_track(
    tx: &mut rocksky_db::tx::Tx<'_>,
    scrobble_record: ScrobbleRecord,
) -> Result<String, Error> {
    let uri: Option<String> = None;
    let hash = sha256::digest(
        format!(
            "{} - {} - {}",
            scrobble_record.title, scrobble_record.artist, scrobble_record.album
        )
        .to_lowercase(),
    );

    // Fall back to MBID or ISRC when the source supplied one — covers cosmetic
    // title variations between scrobble sources that the sha256 hash would miss.
    let mb_id_filter = scrobble_record
        .mbid
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let isrc_filter = scrobble_record
        .isrc
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());

    let existing: Option<Track> = tx
        .fetch_optional(&track_by_hash_or_id(&hash, mb_id_filter, isrc_filter))
        .await?;

    if let Some(t) = existing {
        return Ok(t.xata_id);
    }

    // DO UPDATE SET sha256 = tracks.sha256 forces RETURNING to fire on conflict,
    // so a concurrent insert of the same sha256 still gives us back the existing
    // xata_id instead of needing a follow-up SELECT.
    let insert = Query::insert()
        .into_table(Tracks::Table)
        .columns([
            Tracks::XataId,
            Tracks::Title,
            Tracks::Artist,
            Tracks::Album,
            Tracks::AlbumArt,
            Tracks::AlbumArtist,
            Tracks::TrackNumber,
            Tracks::Duration,
            Tracks::MbId,
            Tracks::Isrc,
            Tracks::Composer,
            Tracks::Lyrics,
            Tracks::DiscNumber,
            Tracks::Sha256,
            Tracks::CopyrightMessage,
            Tracks::Uri,
            Tracks::SpotifyLink,
            Tracks::AppleMusicLink,
            Tracks::TidalLink,
            Tracks::YoutubeLink,
            Tracks::Label,
        ])
        .values_panic([
            rocksky_db::new_id().into(),
            scrobble_record.title.into(),
            scrobble_record.artist.into(),
            scrobble_record.album.into(),
            scrobble_record.album_art_url.into(),
            scrobble_record.album_artist.into(),
            scrobble_record.track_number.into(),
            scrobble_record.duration.into(),
            scrobble_record.mbid.into(),
            scrobble_record.isrc.into(),
            scrobble_record.composer.into(),
            scrobble_record.lyrics.into(),
            scrobble_record.disc_number.into(),
            hash.clone().into(),
            scrobble_record.copyright_message.into(),
            uri.into(),
            scrobble_record.spotify_link.into(),
            scrobble_record.apple_music_link.into(),
            scrobble_record.tidal_link.into(),
            scrobble_record.youtube_link.into(),
            scrobble_record.label.into(),
        ])
        .on_conflict(keep_existing(Tracks::Table, Tracks::Sha256))
        .returning_col(Tracks::XataId)
        .to_owned();

    // `RETURNING` always yields a row; no row means the insert did not
    // happen, which is a bug rather than an outcome.
    tx.fetch_scalar(&insert)
        .await?
        .ok_or_else(|| anyhow::anyhow!("insert returned no row"))
}

pub async fn save_album(
    tx: &mut rocksky_db::tx::Tx<'_>,
    scrobble_record: ScrobbleRecord,
) -> Result<String, Error> {
    let hash = sha256::digest(
        format!(
            "{} - {}",
            scrobble_record.album, scrobble_record.album_artist
        )
        .to_lowercase(),
    );

    let existing: Option<String> = tx.fetch_scalar(&id_by_sha256(Albums::Table, &hash)).await?;

    if let Some(id) = existing {
        tracing::info!(name = %scrobble_record.album.magenta(), "Album already exists");
        return Ok(id);
    }

    tracing::info!(name = %scrobble_record.album, "Saving new album");

    let uri: Option<String> = None;
    let artist_uri: Option<String> = None;
    let insert = Query::insert()
        .into_table(Albums::Table)
        .columns([
            Albums::XataId,
            Albums::Title,
            Albums::Artist,
            Albums::AlbumArt,
            Albums::Year,
            Albums::ReleaseDate,
            Albums::Sha256,
            Albums::Uri,
            Albums::ArtistUri,
        ])
        .values_panic([
            rocksky_db::new_id().into(),
            scrobble_record.album.into(),
            scrobble_record.album_artist.into(),
            scrobble_record.album_art_url.into(),
            scrobble_record.year.into(),
            scrobble_record.release_date.into(),
            hash.clone().into(),
            uri.into(),
            artist_uri.into(),
        ])
        .on_conflict(keep_existing(Albums::Table, Albums::Sha256))
        .returning_col(Albums::XataId)
        .to_owned();

    // `RETURNING` always yields a row; no row means the insert did not
    // happen, which is a bug rather than an outcome.
    tx.fetch_scalar(&insert)
        .await?
        .ok_or_else(|| anyhow::anyhow!("insert returned no row"))
}

pub async fn save_artist(
    tx: &mut rocksky_db::tx::Tx<'_>,
    scrobble_record: ScrobbleRecord,
) -> Result<String, Error> {
    let hash = sha256::digest(scrobble_record.album_artist.to_lowercase());
    let existing: Option<String> = tx
        .fetch_scalar(&id_by_sha256(Artists::Table, &hash))
        .await?;

    if let Some(id) = existing {
        tracing::info!(name = %scrobble_record.album_artist, "Artist already exists");
        return Ok(id);
    }

    tracing::info!(name = %scrobble_record.album_artist, "Saving new artist");

    let uri: Option<String> = None;
    let picture = "";
    let insert = Query::insert()
        .into_table(Artists::Table)
        .columns([
            Artists::XataId,
            Artists::Name,
            Artists::Sha256,
            Artists::Uri,
            Artists::Picture,
            Artists::Genres,
        ])
        .values_panic([
            rocksky_db::new_id().into(),
            // The album artist, the same string the hash is taken from. Named
            // from `artist` — the credited string, "Mason, Princess
            // Superstar" — the row ends up keyed by one artist and named
            // after another: every later scrobble of that album artist finds
            // the row by hash and lands on a page titled with a stranger's
            // name. 745 rows in production have that shape.
            scrobble_record.album_artist.into(),
            hash.clone().into(),
            uri.into(),
            picture.into(),
            // A real array on Postgres, JSON text on SQLite — whose binder
            // panics outright on an array argument.
            rocksky_db::models::text_array_value(tx.dialect(), scrobble_record.tags.as_deref()),
        ])
        .on_conflict(keep_existing(Artists::Table, Artists::Sha256))
        .returning_col(Artists::XataId)
        .to_owned();

    // `RETURNING` always yields a row; no row means the insert did not
    // happen, which is a bug rather than an outcome.
    tx.fetch_scalar(&insert)
        .await?
        .ok_or_else(|| anyhow::anyhow!("insert returned no row"))
}

pub async fn save_album_track(
    tx: &mut rocksky_db::tx::Tx<'_>,
    album_id: &str,
    track_id: &str,
) -> Result<(), Error> {
    let exists: Option<AlbumTrack> = tx
        .fetch_optional(
            &Query::select()
                .column(Asterisk)
                .from(AlbumTracks::Table)
                .and_where(Expr::col(AlbumTracks::AlbumId).eq(album_id))
                .and_where(Expr::col(AlbumTracks::TrackId).eq(track_id))
                .take(),
        )
        .await?;

    if exists.is_some() {
        tracing::info!(album_id = %album_id, track_id = %track_id, "Album track already exists");
        return Ok(());
    }

    tracing::info!(album_id = %album_id, track_id = %track_id, "Saving album track");

    let insert = Query::insert()
        .into_table(AlbumTracks::Table)
        .columns([
            AlbumTracks::XataId,
            AlbumTracks::AlbumId,
            AlbumTracks::TrackId,
        ])
        .values_panic([
            rocksky_db::new_id().into(),
            album_id.into(),
            track_id.into(),
        ])
        .on_conflict(OnConflict::new().do_nothing().to_owned())
        .to_owned();

    tx.execute(&insert).await?;
    Ok(())
}

pub async fn save_artist_track(
    tx: &mut rocksky_db::tx::Tx<'_>,
    artist_id: &str,
    track_id: &str,
) -> Result<(), Error> {
    let exists: Option<ArtistTrack> = tx
        .fetch_optional(
            &Query::select()
                .column(Asterisk)
                .from(ArtistTracks::Table)
                .and_where(Expr::col(ArtistTracks::ArtistId).eq(artist_id))
                .and_where(Expr::col(ArtistTracks::TrackId).eq(track_id))
                .take(),
        )
        .await?;

    if exists.is_some() {
        tracing::info!(artist_id = %artist_id, track_id = %track_id, "Artist track already exists");
        return Ok(());
    }

    tracing::info!(artist_id = %artist_id, track_id = %track_id, "Saving artist track");

    let insert = Query::insert()
        .into_table(ArtistTracks::Table)
        .columns([
            ArtistTracks::XataId,
            ArtistTracks::ArtistId,
            ArtistTracks::TrackId,
        ])
        .values_panic([
            rocksky_db::new_id().into(),
            artist_id.into(),
            track_id.into(),
        ])
        .on_conflict(OnConflict::new().do_nothing().to_owned())
        .to_owned();

    tx.execute(&insert).await?;
    Ok(())
}

pub async fn save_artist_album(
    tx: &mut rocksky_db::tx::Tx<'_>,
    artist_id: &str,
    album_id: &str,
) -> Result<(), Error> {
    let exists: Option<ArtistAlbum> = tx
        .fetch_optional(
            &Query::select()
                .column(Asterisk)
                .from(ArtistAlbums::Table)
                .and_where(Expr::col(ArtistAlbums::ArtistId).eq(artist_id))
                .and_where(Expr::col(ArtistAlbums::AlbumId).eq(album_id))
                .take(),
        )
        .await?;

    if exists.is_some() {
        tracing::info!(artist_id = %artist_id, album_id = %album_id, "Artist album already exists");
        return Ok(());
    }

    tracing::info!(artist_id = %artist_id, album_id = %album_id, "Saving artist album");

    let insert = Query::insert()
        .into_table(ArtistAlbums::Table)
        .columns([
            ArtistAlbums::XataId,
            ArtistAlbums::ArtistId,
            ArtistAlbums::AlbumId,
        ])
        .values_panic([
            rocksky_db::new_id().into(),
            artist_id.into(),
            album_id.into(),
        ])
        .on_conflict(OnConflict::new().do_nothing().to_owned())
        .to_owned();

    tx.execute(&insert).await?;
    Ok(())
}

pub async fn save_user_artist(
    tx: &mut rocksky_db::tx::Tx<'_>,
    user_id: &str,
    record: ArtistRecord,
    uri: &str,
) -> Result<(), Error> {
    let hash = sha256::digest(record.name.to_lowercase());

    let mut artist: Option<String> = tx
        .fetch_scalar(&id_by_sha256(Artists::Table, &hash))
        .await?;

    if artist.is_none() {
        tracing::info!(name = %record.name, "Artist not found in database, inserting new artist");
        let insert = Query::insert()
            .into_table(Artists::Table)
            .columns([
                Artists::XataId,
                Artists::Name,
                Artists::Sha256,
                Artists::Uri,
                Artists::Picture,
            ])
            .values_panic([
                rocksky_db::new_id().into(),
                record.name.into(),
                hash.clone().into(),
                uri.into(),
                record.picture_url.into(),
            ])
            .to_owned();
        tx.execute(&insert).await?;

        artist = tx
            .fetch_scalar(&id_by_sha256(Artists::Table, &hash))
            .await?;
    }

    let artist_id =
        artist.ok_or_else(|| anyhow::anyhow!("Artist {} vanished after insert", hash))?;

    let mine = || {
        Expr::col(UserArtists::UserId)
            .eq(user_id)
            .and(Expr::col(UserArtists::ArtistId).eq(&artist_id))
    };

    let existing: Option<UserArtist> = tx
        .fetch_optional(
            &Query::select()
                .column(Asterisk)
                .from(UserArtists::Table)
                .and_where(mine())
                .take(),
        )
        .await?;

    if existing.is_some() {
        tracing::info!(user_id = %user_id, artist_id = %artist_id, "Updating user artist");
        let update = bump_scrobbles(
            UserArtists::Table,
            UserArtists::Scrobbles,
            UserArtists::Uri,
            uri,
            mine(),
        );
        tx.execute(&update).await?;
        return Ok(());
    }

    tracing::info!(user_id = %user_id, artist_id = %artist_id, "Inserting user artist");

    let insert = Query::insert()
        .into_table(UserArtists::Table)
        .columns([
            UserArtists::XataId,
            UserArtists::UserId,
            UserArtists::ArtistId,
            UserArtists::Uri,
            UserArtists::Scrobbles,
        ])
        .values_panic([
            rocksky_db::new_id().into(),
            user_id.into(),
            artist_id.into(),
            uri.into(),
            1.into(),
        ])
        .to_owned();

    tx.execute(&insert).await?;
    Ok(())
}

pub async fn save_user_album(
    tx: &mut rocksky_db::tx::Tx<'_>,
    user_id: &str,
    record: AlbumRecord,
    uri: &str,
) -> Result<(), Error> {
    let hash = sha256::digest(format!("{} - {}", record.title, record.artist).to_lowercase());
    let mut album: Option<String> = tx.fetch_scalar(&id_by_sha256(Albums::Table, &hash)).await?;

    if album.is_none() {
        tracing::info!(title = %record.title, artist = %record.artist, "Album not found in database, inserting new album");
        let insert = Query::insert()
            .into_table(Albums::Table)
            .columns([
                Albums::XataId,
                Albums::Title,
                Albums::Artist,
                Albums::AlbumArt,
                Albums::Year,
                Albums::ReleaseDate,
                Albums::Sha256,
                Albums::Uri,
            ])
            .values_panic([
                rocksky_db::new_id().into(),
                record.title.into(),
                record.artist.into(),
                record.album_art_url.into(),
                record.year.into(),
                record.release_date.into(),
                hash.clone().into(),
                uri.into(),
            ])
            .to_owned();
        tx.execute(&insert).await?;

        album = tx.fetch_scalar(&id_by_sha256(Albums::Table, &hash)).await?;
    }

    let album_id = album.ok_or_else(|| anyhow::anyhow!("Album {} vanished after insert", hash))?;

    let mine = || {
        Expr::col(UserAlbums::UserId)
            .eq(user_id)
            .and(Expr::col(UserAlbums::AlbumId).eq(&album_id))
    };

    let existing: Option<UserAlbum> = tx
        .fetch_optional(
            &Query::select()
                .column(Asterisk)
                .from(UserAlbums::Table)
                .and_where(mine())
                .take(),
        )
        .await?;

    if existing.is_some() {
        tracing::info!(user_id = %user_id, album_id = %album_id, "Updating user album");
        let update = bump_scrobbles(
            UserAlbums::Table,
            UserAlbums::Scrobbles,
            UserAlbums::Uri,
            uri,
            mine(),
        );
        tx.execute(&update).await?;
        return Ok(());
    }

    tracing::info!(user_id = %user_id, album_id = %album_id, "Inserting user album");

    let insert = Query::insert()
        .into_table(UserAlbums::Table)
        .columns([
            UserAlbums::XataId,
            UserAlbums::UserId,
            UserAlbums::AlbumId,
            UserAlbums::Uri,
            UserAlbums::Scrobbles,
        ])
        .values_panic([
            rocksky_db::new_id().into(),
            user_id.into(),
            album_id.into(),
            uri.into(),
            1.into(),
        ])
        .to_owned();

    tx.execute(&insert).await?;
    Ok(())
}

pub async fn save_user_track(
    tx: &mut rocksky_db::tx::Tx<'_>,
    user_id: &str,
    record: SongRecord,
    uri: &str,
) -> Result<(), Error> {
    let hash = sha256::digest(
        format!("{} - {} - {}", record.title, record.artist, record.album).to_lowercase(),
    );

    let mb_id_filter = record
        .mbid
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let isrc_filter = record
        .isrc
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());

    // Rank sha (exact title+artist+album) above MBID, MBID above ISRC — see
    // `track_by_hash_or_id` for the rationale (recordings shared across albums).
    let found: Option<Track> = tx
        .fetch_optional(&track_by_hash_or_id(&hash, mb_id_filter, isrc_filter))
        .await?;

    let track_id = match found {
        None => {
            tracing::info!(title = %record.title, artist = %record.artist, album = %record.album, "Track not found in database, inserting new track");
            let insert = Query::insert()
                .into_table(Tracks::Table)
                .columns([
                    Tracks::XataId,
                    Tracks::Title,
                    Tracks::Artist,
                    Tracks::Album,
                    Tracks::AlbumArt,
                    Tracks::AlbumArtist,
                    Tracks::TrackNumber,
                    Tracks::Duration,
                    Tracks::MbId,
                    Tracks::Isrc,
                    Tracks::Composer,
                    Tracks::Lyrics,
                    Tracks::DiscNumber,
                    Tracks::Sha256,
                    Tracks::CopyrightMessage,
                    Tracks::Uri,
                    Tracks::SpotifyLink,
                    Tracks::Label,
                ])
                .values_panic([
                    rocksky_db::new_id().into(),
                    record.title.into(),
                    record.artist.into(),
                    record.album.into(),
                    record.album_art_url.into(),
                    record.album_artist.into(),
                    record.track_number.into(),
                    record.duration.into(),
                    record.mbid.into(),
                    record.isrc.into(),
                    record.composer.into(),
                    record.lyrics.into(),
                    record.disc_number.into(),
                    hash.clone().into(),
                    record.copyright_message.into(),
                    uri.into(),
                    record.spotify_link.into(),
                    record.label.into(),
                ])
                .on_conflict(
                    OnConflict::column(Tracks::Sha256)
                        .value(
                            Tracks::Uri,
                            Func::coalesce([
                                Expr::col((Tracks::Table, Tracks::Uri)).into(),
                                Expr::col((Alias::new("excluded"), Tracks::Uri)).into(),
                            ]),
                        )
                        .to_owned(),
                )
                .to_owned();
            tx.execute(&insert).await?;

            let inserted: Option<String> =
                tx.fetch_scalar(&id_by_sha256(Tracks::Table, &hash)).await?;
            inserted.ok_or_else(|| anyhow::anyhow!("Track {} vanished after insert", hash))?
        }
        Some(track) => {
            // The scrobble path (`save_track`) inserts its `tracks` row with a
            // NULL uri — it only ever sees an `app.rocksky.scrobble` record, so
            // there is no song at-uri to store. `update_track_uri` backfills
            // that afterwards, but only for a row found by sha256; when the
            // lookup above matched on mb_id/isrc instead (a cosmetic title
            // difference between sources), its sha differs and the row would
            // stay uri-less forever. Guarded on IS NULL so an existing uri —
            // the first publisher's — is never repointed.
            if track.uri.is_none() {
                let update = Query::update()
                    .table(Tracks::Table)
                    .value(Tracks::Uri, uri)
                    .and_where(Expr::col(Tracks::XataId).eq(&track.xata_id))
                    .and_where(Expr::col(Tracks::Uri).is_null())
                    .to_owned();
                tx.execute(&update).await?;
            }
            track.xata_id
        }
    };

    let mine = || {
        Expr::col(UserTracks::UserId)
            .eq(user_id)
            .and(Expr::col(UserTracks::TrackId).eq(&track_id))
    };

    let existing: Option<UserTrack> = tx
        .fetch_optional(
            &Query::select()
                .column(Asterisk)
                .from(UserTracks::Table)
                .and_where(mine())
                .take(),
        )
        .await?;

    if existing.is_some() {
        tracing::info!(user_id = %user_id, track_id = %track_id, "Updating user track");
        let update = bump_scrobbles(
            UserTracks::Table,
            UserTracks::Scrobbles,
            UserTracks::Uri,
            uri,
            mine(),
        );
        tx.execute(&update).await?;
        return Ok(());
    }

    tracing::info!(user_id = %user_id, track_id = %track_id, "Inserting user track");

    let insert = Query::insert()
        .into_table(UserTracks::Table)
        .columns([
            UserTracks::XataId,
            UserTracks::UserId,
            UserTracks::TrackId,
            UserTracks::Uri,
            UserTracks::Scrobbles,
        ])
        .values_panic([
            rocksky_db::new_id().into(),
            user_id.into(),
            track_id.into(),
            uri.into(),
            1.into(),
        ])
        .to_owned();

    tx.execute(&insert).await?;

    Ok(())
}

pub async fn update_artist_uri(
    tx: &mut rocksky_db::tx::Tx<'_>,
    user_id: &str,
    record: ArtistRecord,
    uri: &str,
) -> Result<(), Error> {
    let hash = sha256::digest(record.name.to_lowercase());
    let artist: Option<String> = tx
        .fetch_scalar(&id_by_sha256(Artists::Table, &hash))
        .await?;

    let Some(artist) = artist else {
        tracing::warn!(name = %record.name, "Artist not found in database");
        return Ok(());
    };

    let link_user = Query::update()
        .table(UserArtists::Table)
        .value(UserArtists::Uri, uri)
        .and_where(Expr::col(UserArtists::UserId).eq(user_id))
        .and_where(Expr::col(UserArtists::ArtistId).eq(&artist))
        .to_owned();
    tx.execute(&link_user).await?;

    let stamp_tracks = Query::update()
        .table(Tracks::Table)
        .value(Tracks::ArtistUri, uri)
        .and_where(Expr::col(Tracks::ArtistUri).is_null())
        .and_where(Expr::col(Tracks::AlbumArtist).eq(&record.name))
        .to_owned();
    tx.execute(&stamp_tracks).await?;

    let stamp_artist = Query::update()
        .table(Artists::Table)
        .value(Artists::Uri, uri)
        .and_where(Expr::col(Artists::Sha256).eq(&hash))
        .and_where(Expr::col(Artists::Uri).is_null())
        .to_owned();
    tx.execute(&stamp_artist).await?;

    let stamp_albums = Query::update()
        .table(Albums::Table)
        .value(Albums::ArtistUri, uri)
        .and_where(Expr::col(Albums::ArtistUri).is_null())
        .and_where(Expr::col(Albums::Artist).eq(&record.name))
        .to_owned();
    tx.execute(&stamp_albums).await?;

    Ok(())
}

pub async fn update_album_uri(
    tx: &mut rocksky_db::tx::Tx<'_>,
    user_id: &str,
    record: AlbumRecord,
    uri: &str,
) -> Result<(), Error> {
    let hash = sha256::digest(format!("{} - {}", record.title, record.artist).to_lowercase());
    let album: Option<String> = tx.fetch_scalar(&id_by_sha256(Albums::Table, &hash)).await?;

    let Some(album) = album else {
        tracing::warn!(title = %record.title, "Album not found in database");
        return Ok(());
    };

    let link_user = Query::update()
        .table(UserAlbums::Table)
        .value(UserAlbums::Uri, uri)
        .and_where(Expr::col(UserAlbums::UserId).eq(user_id))
        .and_where(Expr::col(UserAlbums::AlbumId).eq(&album))
        .to_owned();
    tx.execute(&link_user).await?;

    let stamp_tracks = Query::update()
        .table(Tracks::Table)
        .value(Tracks::AlbumUri, uri)
        .and_where(Expr::col(Tracks::AlbumUri).is_null())
        .and_where(Expr::col(Tracks::Album).eq(&record.title))
        .to_owned();
    tx.execute(&stamp_tracks).await?;

    let stamp_album = Query::update()
        .table(Albums::Table)
        .value(Albums::Uri, uri)
        .and_where(Expr::col(Albums::Sha256).eq(&hash))
        .and_where(Expr::col(Albums::Uri).is_null())
        .to_owned();
    tx.execute(&stamp_album).await?;

    Ok(())
}

pub async fn update_track_uri(
    tx: &mut rocksky_db::tx::Tx<'_>,
    user_id: &str,
    record: SongRecord,
    uri: &str,
) -> Result<(), Error> {
    let hash = sha256::digest(
        format!("{} - {} - {}", record.title, record.artist, record.album).to_lowercase(),
    );
    let track: Option<String> = tx.fetch_scalar(&id_by_sha256(Tracks::Table, &hash)).await?;

    let Some(track) = track else {
        tracing::warn!(title = %record.title, "Track not found in database");
        return Ok(());
    };

    let link_user = Query::update()
        .table(UserTracks::Table)
        .value(UserTracks::Uri, uri)
        .and_where(Expr::col(UserTracks::UserId).eq(user_id))
        .and_where(Expr::col(UserTracks::TrackId).eq(&track))
        .to_owned();
    tx.execute(&link_user).await?;

    let stamp_track = Query::update()
        .table(Tracks::Table)
        .value(Tracks::Uri, uri)
        .and_where(Expr::col(Tracks::Sha256).eq(&hash))
        .and_where(Expr::col(Tracks::Uri).is_null())
        .to_owned();
    tx.execute(&stamp_track).await?;

    Ok(())
}

pub async fn save_feed_generator(
    tx: &mut rocksky_db::tx::Tx<'_>,
    user_id: &str,
    record: FeedGeneratorRecord,
    uri: &str,
) -> Result<(), Error> {
    let did = uri
        .split('/')
        .nth(2)
        .ok_or_else(|| anyhow::anyhow!("Invalid URI: {}", uri))?;
    let avatar = record.avatar.map(|blob| {
        format!(
            "https://cdn.bsky.app/img/avatar/plain/{}/{}@{}",
            did,
            blob.r#ref.link,
            blob.mime_type.split('/').last().unwrap_or("jpeg")
        )
    });

    tracing::info!(user_id = %user_id, display_name = %record.display_name, uri = %uri, "Saving feed generator");

    let insert = Query::insert()
        .into_table(Feeds::Table)
        .columns([
            Feeds::XataId,
            Feeds::UserId,
            Feeds::Uri,
            Feeds::DisplayName,
            Feeds::Description,
            Feeds::Did,
            Feeds::Avatar,
        ])
        .values_panic([
            rocksky_db::new_id().into(),
            user_id.into(),
            uri.into(),
            record.display_name.into(),
            record.description.into(),
            record.did.into(),
            avatar.into(),
        ])
        .to_owned();

    tx.execute(&insert).await?;
    Ok(())
}

pub async fn save_follow(
    tx: &mut rocksky_db::tx::Tx<'_>,
    did: &str,
    record: FollowRecord,
    uri: &str,
) -> Result<(), Error> {
    tracing::info!(did = %did, uri = %uri, "Saving follow");

    let insert = Query::insert()
        .into_table(Follows::Table)
        .columns([
            Follows::XataId,
            Follows::FollowerDid,
            Follows::SubjectDid,
            Follows::Uri,
        ])
        .values_panic([
            rocksky_db::new_id().into(),
            did.into(),
            record.subject.into(),
            uri.into(),
        ])
        .on_conflict(
            OnConflict::columns([Follows::FollowerDid, Follows::SubjectDid])
                .do_nothing()
                .to_owned(),
        )
        .to_owned();

    tx.execute(&insert).await?;
    Ok(())
}

pub async fn delete_scrobble(pool: &Backend, uri: &str) -> Result<(), Error> {
    let delete = Query::delete()
        .from_table(Scrobbles::Table)
        .and_where(Expr::col(Scrobbles::Uri).eq(uri))
        .to_owned();

    sql::execute(pool, &delete).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sea_query::PostgresQueryBuilder;
    use sea_query_binder::SqlxBinder;

    /// The ranking is the point: the same ISRC can name several `tracks` rows,
    /// so the sha match has to win, then MBID, then ISRC.
    #[test]
    fn the_track_lookup_ranks_sha_above_mbid_above_isrc() {
        let (sql, _) =
            track_by_hash_or_id("hash", Some("mb"), Some("isrc")).build_sqlx(PostgresQueryBuilder);
        let case = &sql[sql.find("CASE").unwrap()..];
        let sha = case.find(r#""sha256""#).unwrap();
        let mb = case.find(r#""mb_id""#).unwrap();
        let isrc = case.find(r#""isrc""#).unwrap();
        assert!(sha < mb && mb < isrc, "{case}");
    }

    /// A branch with no value is left out entirely, rather than carried as a
    /// `$n::text IS NOT NULL` guard the way the hand-written SQL had to.
    #[test]
    fn absent_identifiers_add_no_branches() {
        let (sql, values) =
            track_by_hash_or_id("hash", None, None).build_sqlx(PostgresQueryBuilder);
        assert!(!sql.contains("mb_id"));
        assert!(!sql.contains("isrc"));
        // sha (WHERE), sha (CASE), 0, ELSE 3, LIMIT 1.
        assert_eq!(values.0 .0.len(), 5);
    }

    /// The no-op SET is what makes RETURNING fire on conflict, so a concurrent
    /// insert of the same row hands back its id instead of nothing.
    #[test]
    fn keep_existing_returns_the_row_it_collided_with() {
        let (sql, _) = Query::insert()
            .into_table(Tracks::Table)
            .columns([Tracks::Sha256])
            .values_panic(["h".into()])
            .on_conflict(keep_existing(Tracks::Table, Tracks::Sha256))
            .returning_col(Tracks::XataId)
            .to_owned()
            .build_sqlx(PostgresQueryBuilder);
        assert!(sql.contains(
            r#"ON CONFLICT ("sha256") DO UPDATE SET "sha256" = "tracks"."sha256" RETURNING "xata_id""#
        ));
    }
}

/// The transactional writes, executed against a real SQLite.
///
/// jetstream's ingest is the one place in the repository that groups writes
/// into transactions — a playlist and the rows linking it to its tracks have
/// to land together — and `sqlx`'s transactions are typed by driver, so those
/// eighteen sites were Postgres-only by construction. They go through
/// `rocksky_db::tx::Tx` now, and the only way to know that works is to run it.
#[cfg(test)]
mod sqlite_behaviour {
    use super::*;
    use rocksky_db::sea_query::Query as SqQuery;

    async fn db() -> Backend {
        rocksky_db::connect_in_memory().await.unwrap()
    }

    fn a_scrobble(title: &str, album: &str, artist: &str) -> ScrobbleRecord {
        ScrobbleRecord {
            track_number: Some(1),
            disc_number: Some(1),
            title: title.into(),
            artist: artist.into(),
            album_artist: artist.into(),
            album: album.into(),
            duration: 240_000,
            release_date: None,
            year: Some(1985),
            genre: None,
            tags: None,
            composer: None,
            lyrics: None,
            copyright_message: None,
            wiki: None,
            album_art: None,
            album_art_url: None,
            youtube_link: None,
            spotify_link: None,
            tidal_link: None,
            apple_music_link: None,
            created_at: "2026-01-01T00:00:00.000Z".into(),
            label: None,
            mbid: None,
            isrc: None,
            artists: None,
        }
    }

    async fn count(db: &Backend, table: &str) -> i64 {
        db.count(
            &SqQuery::select()
                .expr(db.cast_int(Func::count(Expr::col(Alias::new("xata_id")))))
                .from(Alias::new(table))
                .to_owned(),
        )
        .await
        .unwrap()
    }

    /// An artist and an album, created inside a transaction and committed.
    ///
    /// `save_artist` and `save_album` are find-or-create: they look the row up
    /// by content hash, insert when it is missing, and return the id. Both
    /// halves have to work through the transaction handle.
    #[tokio::test]
    async fn the_find_or_create_writes_commit_on_sqlite() {
        let db = db().await;
        let record = a_scrobble("Cloudbusting", "Hounds of Love", "Kate Bush");

        let mut tx = db.begin().await.unwrap();
        let artist = save_artist(&mut tx, record.clone()).await.unwrap();
        let album = save_album(&mut tx, record.clone()).await.unwrap();
        tx.commit().await.unwrap();

        assert!(!artist.is_empty());
        assert!(!album.is_empty());
        assert_eq!(count(&db, "artists").await, 1);
        assert_eq!(count(&db, "albums").await, 1);

        // Again, in a second transaction: found rather than created, so the
        // ids match and nothing is duplicated. This is the property the
        // content hashes exist for.
        let mut tx = db.begin().await.unwrap();
        let artist_again = save_artist(&mut tx, record.clone()).await.unwrap();
        let album_again = save_album(&mut tx, record).await.unwrap();
        tx.commit().await.unwrap();

        assert_eq!(artist_again, artist);
        assert_eq!(album_again, album);
        assert_eq!(count(&db, "artists").await, 1);
        assert_eq!(count(&db, "albums").await, 1);
    }

    /// A transaction dropped without committing leaves nothing behind — which
    /// is what makes a half-written group impossible.
    #[tokio::test]
    async fn an_abandoned_transaction_writes_nothing() {
        let db = db().await;

        {
            let mut tx = db.begin().await.unwrap();
            save_artist(&mut tx, a_scrobble("x", "y", "Rolled Back"))
                .await
                .unwrap();
            // No commit.
        }

        assert_eq!(count(&db, "artists").await, 0);
    }
}
