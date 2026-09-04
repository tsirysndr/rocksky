//! Rocksky rows → Jellyfin `BaseItemDto`s.
//!
//! Everything goes through the batch entry points here rather than a
//! per-row helper: emitting a page of items needs the guid mapping written and
//! the user-data sidecar read for every row, and doing either one row at a time
//! turns a 100-item listing into hundreds of round trips.

use chrono::{DateTime, Utc};
use std::collections::{HashMap, HashSet};

use rocksky_navidrome::{
    handlers::albums::mime_to_suffix,
    repo::playlist::PlaylistRow,
    xata::{album::AlbumWithStats, artist::ArtistWithStats, track::TrackWithUpload},
};

use crate::{
    auth::AuthedUser,
    dto::{
        BaseItemDto, ImageBlurHashes, ImageTags, MediaSource, MediaStream, NameGuidPair,
        UserItemDataDto, TICKS_PER_MS,
    },
    guid,
    state::AppState,
    userdata::{self, ItemUserData},
};

/// What every conversion needs: which server is answering, and for whom.
pub struct Ctx<'a> {
    pub state: &'a AppState,
    pub user: &'a AuthedUser,
}

impl<'a> Ctx<'a> {
    pub fn new(state: &'a AppState, user: &'a AuthedUser) -> Self {
        Self { state, user }
    }

    fn server_id(&self) -> Option<String> {
        Some(self.state.server_id.clone())
    }
}

/// The naive, 7-fractional-digit timestamp the reference server emits
/// (`2026-06-29T12:17:19.6620000`).
///
/// jellyfin-sdk-kotlin parses these as `LocalDateTime`, which rejects a
/// trailing `Z` or `+00:00` — and a rejected field takes the whole object with
/// it, silently.
pub fn jellyfin_time(dt: DateTime<Utc>) -> String {
    format!(
        "{}.{:07}",
        dt.format("%Y-%m-%dT%H:%M:%S"),
        dt.timestamp_subsec_nanos() / 100
    )
}

pub fn now_iso() -> String {
    jellyfin_time(Utc::now())
}

fn user_item_data(guid: String, data: &ItemUserData, is_favorite: bool) -> UserItemDataDto {
    UserItemDataDto {
        rating: data.rating,
        played_percentage: None,
        unplayed_item_count: None,
        playback_position_ticks: data.playback_position_ticks,
        play_count: data.play_count,
        is_favorite,
        likes: data.likes,
        last_played_date: data.last_played_date.map(jellyfin_time),
        played: data.played,
        key: guid.clone(),
        item_id: guid,
    }
}

// ── Library folders ─────────────────────────────────────────────────────────

pub fn music_library(state: &AppState) -> BaseItemDto {
    BaseItemDto {
        id: guid::library_guid(),
        server_id: Some(state.server_id.clone()),
        name: Some("Music".to_string()),
        item_type: "CollectionFolder",
        media_type: "Unknown",
        is_folder: Some(true),
        collection_type: Some("music"),
        location_type: Some("FileSystem"),
        ..Default::default()
    }
}

pub fn playlists_library(state: &AppState) -> BaseItemDto {
    BaseItemDto {
        id: guid::playlists_library_guid(),
        server_id: Some(state.server_id.clone()),
        name: Some("Playlists".to_string()),
        item_type: "CollectionFolder",
        media_type: "Unknown",
        is_folder: Some(true),
        collection_type: Some("playlists"),
        location_type: Some("FileSystem"),
        ..Default::default()
    }
}

pub fn all_libraries(state: &AppState) -> Vec<BaseItemDto> {
    vec![music_library(state), playlists_library(state)]
}

/// The `CollectionFolder` behind one of the virtual library ids, if that is
/// what the caller asked for. Clients fetch this for the library page header
/// before listing its children.
pub fn library_by_guid(state: &AppState, id: &str) -> Option<BaseItemDto> {
    if id == guid::library_guid() {
        Some(music_library(state))
    } else if id == guid::playlists_library_guid() {
        Some(playlists_library(state))
    } else {
        None
    }
}

// ── Artists ─────────────────────────────────────────────────────────────────

pub async fn artists_to_items(ctx: &Ctx<'_>, rows: &[ArtistWithStats]) -> Vec<BaseItemDto> {
    let ids: Vec<String> = rows.iter().map(|a| a.xata_id.clone()).collect();
    guid::remember_many(&ctx.state.pool, guid::KIND_ARTIST, &ids).await;
    let data = userdata::get_many(&ctx.state.pool, &ctx.user.id, &ids).await;

    rows.iter().map(|a| artist_item(ctx, a, &data)).collect()
}

fn artist_item(
    ctx: &Ctx<'_>,
    a: &ArtistWithStats,
    data: &HashMap<String, ItemUserData>,
) -> BaseItemDto {
    let id = guid::guid(guid::KIND_ARTIST, &a.xata_id);
    let ud = data.get(&a.xata_id).cloned().unwrap_or_default();
    BaseItemDto {
        id: id.clone(),
        server_id: ctx.server_id(),
        name: Some(a.name.clone()),
        sort_name: Some(a.name.clone()),
        item_type: "MusicArtist",
        media_type: "Unknown",
        is_folder: Some(true),
        parent_id: Some(guid::library_guid()),
        album_count: Some(a.album_count as i32),
        child_count: Some(a.album_count as i32),
        location_type: Some("FileSystem"),
        image_tags: Some(ImageTags {
            primary: a.picture.as_ref().map(|_| id.clone()),
        }),
        image_blur_hashes: Some(ImageBlurHashes::default()),
        user_data: Some(user_item_data(id, &ud, false)),
        ..Default::default()
    }
}

// ── Albums ──────────────────────────────────────────────────────────────────

pub async fn albums_to_items(ctx: &Ctx<'_>, rows: &[AlbumWithStats]) -> Vec<BaseItemDto> {
    let ids: Vec<String> = rows.iter().map(|a| a.xata_id.clone()).collect();
    let artist_ids: Vec<String> = rows.iter().filter_map(|a| a.artist_id.clone()).collect();
    guid::remember_many(&ctx.state.pool, guid::KIND_ALBUM, &ids).await;
    guid::remember_many(&ctx.state.pool, guid::KIND_ARTIST, &artist_ids).await;
    let data = userdata::get_many(&ctx.state.pool, &ctx.user.id, &ids).await;

    rows.iter().map(|a| album_item(ctx, a, &data)).collect()
}

fn album_item(
    ctx: &Ctx<'_>,
    al: &AlbumWithStats,
    data: &HashMap<String, ItemUserData>,
) -> BaseItemDto {
    let id = guid::guid(guid::KIND_ALBUM, &al.xata_id);
    let artist_guid = al
        .artist_id
        .as_ref()
        .map(|aid| guid::guid(guid::KIND_ARTIST, aid));
    let ud = data.get(&al.xata_id).cloned().unwrap_or_default();

    let credit = vec![NameGuidPair {
        name: Some(al.artist.clone()),
        id: artist_guid.clone().unwrap_or_else(|| id.clone()),
    }];

    // The AT-URI of the `app.rocksky.album` record, when it has been published.
    // The Jellyfin id is local to this server, so this is what lets a client
    // name the album anywhere else.
    let external_urls = al.uri.as_ref().map(|uri| {
        vec![crate::dto::ExternalUrl {
            name: Some("Rocksky".to_string()),
            url: Some(uri.clone()),
        }]
    });

    BaseItemDto {
        id: id.clone(),
        server_id: ctx.server_id(),
        name: Some(al.title.clone()),
        sort_name: Some(al.title.clone()),
        item_type: "MusicAlbum",
        media_type: "Unknown",
        is_folder: Some(true),
        album: Some(al.title.clone()),
        album_id: Some(id.clone()),
        album_artist: Some(al.artist.clone()),
        album_artists: Some(credit.clone()),
        artist_items: Some(credit),
        artists: Some(vec![al.artist.clone()]),
        parent_id: artist_guid.or_else(|| Some(guid::library_guid())),
        production_year: al.year,
        premiere_date: al
            .year
            .filter(|y| *y > 0)
            .map(|y| format!("{:04}-01-01T00:00:00.0000000", y)),
        date_created: al.created_at.map(jellyfin_time),
        run_time_ticks: Some(al.total_duration.unwrap_or(0) * TICKS_PER_MS),
        song_count: Some(al.song_count as i32),
        child_count: Some(al.song_count as i32),
        location_type: Some("FileSystem"),
        external_urls,
        image_tags: Some(ImageTags {
            primary: al.album_art.as_ref().map(|_| id.clone()),
        }),
        image_blur_hashes: Some(ImageBlurHashes::default()),
        user_data: Some(user_item_data(id, &ud, false)),
        ..Default::default()
    }
}

// ── Songs ───────────────────────────────────────────────────────────────────

pub async fn songs_to_items(ctx: &Ctx<'_>, rows: &[TrackWithUpload]) -> Vec<BaseItemDto> {
    let ids: Vec<String> = rows.iter().map(|t| t.xata_id.clone()).collect();
    let album_ids: Vec<String> = rows.iter().filter_map(|t| t.album_id.clone()).collect();
    let artist_ids: Vec<String> = rows.iter().filter_map(|t| t.artist_id.clone()).collect();

    guid::remember_many(&ctx.state.pool, guid::KIND_SONG, &ids).await;
    guid::remember_many(&ctx.state.pool, guid::KIND_ALBUM, &album_ids).await;
    guid::remember_many(&ctx.state.pool, guid::KIND_ARTIST, &artist_ids).await;

    let data = userdata::get_many(&ctx.state.pool, &ctx.user.id, &ids).await;
    let favorites = userdata::favorites_among(&ctx.state.pool, &ctx.user.id, &ids).await;

    rows.iter()
        .map(|t| song_item(ctx, t, &data, &favorites))
        .collect()
}

/// A single song, for the endpoints that only ever return one.
pub async fn song_to_item(ctx: &Ctx<'_>, track: &TrackWithUpload) -> BaseItemDto {
    songs_to_items(ctx, std::slice::from_ref(track))
        .await
        .pop()
        .expect("one row in, one row out")
}

fn song_item(
    ctx: &Ctx<'_>,
    t: &TrackWithUpload,
    data: &HashMap<String, ItemUserData>,
    favorites: &HashSet<String>,
) -> BaseItemDto {
    let id = guid::guid(guid::KIND_SONG, &t.xata_id);
    let album_guid = t
        .album_id
        .as_ref()
        .map(|aid| guid::guid(guid::KIND_ALBUM, aid));
    let artist_guid = t
        .artist_id
        .as_ref()
        .map(|aid| guid::guid(guid::KIND_ARTIST, aid));
    let ud = data.get(&t.xata_id).cloned().unwrap_or_default();

    let suffix = mime_to_suffix(&t.mime_type).to_string();
    let run_time_ticks = t.duration as i64 * TICKS_PER_MS;
    // Uploads have no filesystem path here — the bytes live in object storage —
    // but clients show this string on the track detail sheet, so give them the
    // same artist/album/title shape the Subsonic service reports.
    let path = format!("{}/{}/{}.{}", t.artist, t.album, t.title, suffix);
    let bitrate = bitrate_bps(t.file_size, t.duration);

    let audio_stream = MediaStream {
        codec: Some(suffix.clone()),
        stream_type: "Audio",
        index: 0,
        is_default: true,
        channels: Some(2),
        sample_rate: t.sample_rate,
        bit_rate: bitrate,
        video_range: "Unknown",
        video_range_type: "Unknown",
        audio_spatial_format: "None",
        ..Default::default()
    };

    let media_source = MediaSource {
        // The bytes are served by a redirect to object storage, but as far as
        // the client is concerned it fetches them from us over HTTP.
        protocol: "Http",
        id: Some(id.clone()),
        path: Some(path.clone()),
        source_type: "Default",
        container: Some(suffix.clone()),
        size: Some(t.file_size as i64),
        name: Some(t.title.clone()),
        is_remote: false,
        run_time_ticks: Some(run_time_ticks),
        // We never transcode: the object store hands back the original file.
        supports_transcoding: false,
        supports_direct_stream: true,
        supports_direct_play: true,
        media_streams: Some(vec![audio_stream.clone()]),
        bitrate,
        transcoding_sub_protocol: "http",
        default_audio_stream_index: Some(0),
        ..Default::default()
    };

    let credit = vec![NameGuidPair {
        name: Some(t.album_artist.clone()),
        id: artist_guid.clone().unwrap_or_else(|| id.clone()),
    }];

    BaseItemDto {
        id: id.clone(),
        server_id: ctx.server_id(),
        name: Some(t.title.clone()),
        sort_name: Some(t.title.clone()),
        item_type: "Audio",
        media_type: "Audio",
        is_folder: Some(false),
        index_number: t.track_number,
        parent_index_number: t.disc_number,
        run_time_ticks: Some(run_time_ticks),
        container: Some(suffix),
        path: Some(path),
        date_created: Some(jellyfin_time(t.xata_createdat)),
        album: Some(t.album.clone()),
        album_id: album_guid.clone(),
        album_primary_image_tag: album_guid.clone(),
        album_artist: Some(t.album_artist.clone()),
        album_artists: Some(credit.clone()),
        artist_items: Some(credit),
        artists: Some(vec![t.artist.clone()]),
        parent_id: album_guid.or_else(|| Some(guid::library_guid())),
        genres: t.genre.as_ref().map(|g| vec![g.clone()]),
        location_type: Some("FileSystem"),
        media_sources: Some(vec![media_source]),
        media_source_count: Some(1),
        media_streams: Some(vec![audio_stream]),
        image_tags: Some(ImageTags {
            primary: Some(id.clone()),
        }),
        image_blur_hashes: Some(ImageBlurHashes::default()),
        user_data: Some(user_item_data(
            id,
            &ud,
            favorites.contains(t.xata_id.as_str()),
        )),
        ..Default::default()
    }
}

/// Average bitrate in bits per second, or `None` for a zero-length track —
/// clients render a missing bitrate as "unknown" and a zero one as "0 kbps".
fn bitrate_bps(file_size: i32, duration_ms: i32) -> Option<i32> {
    if duration_ms <= 0 || file_size <= 0 {
        return None;
    }
    let bits = file_size as i64 * 8 * 1000;
    i32::try_from(bits / duration_ms as i64).ok()
}

// ── Playlists ───────────────────────────────────────────────────────────────

pub async fn playlists_to_items(ctx: &Ctx<'_>, rows: &[PlaylistRow]) -> Vec<BaseItemDto> {
    let ids: Vec<String> = rows.iter().map(|p| p.xata_id.clone()).collect();
    guid::remember_many(&ctx.state.pool, guid::KIND_PLAYLIST, &ids).await;
    let data = userdata::get_many(&ctx.state.pool, &ctx.user.id, &ids).await;

    rows.iter().map(|p| playlist_item(ctx, p, &data)).collect()
}

fn playlist_item(
    ctx: &Ctx<'_>,
    p: &PlaylistRow,
    data: &HashMap<String, ItemUserData>,
) -> BaseItemDto {
    let id = guid::guid(guid::KIND_PLAYLIST, &p.xata_id);
    let ud = data.get(&p.xata_id).cloned().unwrap_or_default();
    let external_urls = p.uri.as_ref().map(|uri| {
        vec![crate::dto::ExternalUrl {
            name: Some("Rocksky".to_string()),
            url: Some(uri.clone()),
        }]
    });
    BaseItemDto {
        id: id.clone(),
        server_id: ctx.server_id(),
        name: Some(p.name.clone()),
        sort_name: Some(p.name.clone()),
        item_type: "Playlist",
        media_type: "Audio",
        is_folder: Some(true),
        collection_type: Some("playlists"),
        parent_id: Some(guid::playlists_library_guid()),
        location_type: Some("FileSystem"),
        date_created: Some(jellyfin_time(p.xata_createdat)),
        overview: p.description.clone(),
        child_count: Some(p.track_count as i32),
        song_count: Some(p.track_count as i32),
        run_time_ticks: Some(p.duration_ms * TICKS_PER_MS),
        external_urls,
        image_tags: Some(ImageTags {
            primary: (!p.track_arts.is_empty()).then(|| id.clone()),
        }),
        image_blur_hashes: Some(ImageBlurHashes::default()),
        user_data: Some(user_item_data(id, &ud, false)),
        ..Default::default()
    }
}

// ── Genres ──────────────────────────────────────────────────────────────────

pub async fn genres_to_items(
    ctx: &Ctx<'_>,
    rows: &[rocksky_navidrome::repo::genre::GenreRow],
) -> Vec<BaseItemDto> {
    for row in rows {
        guid::remember_genre(&ctx.state.pool, &row.genre).await;
    }

    rows.iter()
        .map(|g| BaseItemDto {
            id: guid::genre_guid(&g.genre),
            server_id: ctx.server_id(),
            name: Some(g.genre.clone()),
            sort_name: Some(g.genre.clone()),
            item_type: "MusicGenre",
            media_type: "Unknown",
            is_folder: Some(true),
            parent_id: Some(guid::library_guid()),
            song_count: Some(g.song_count as i32),
            album_count: Some(g.album_count as i32),
            child_count: Some(g.song_count as i32),
            location_type: Some("Virtual"),
            ..Default::default()
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn jellyfin_time_has_no_timezone_marker() {
        let dt = DateTime::from_timestamp(1_700_000_000, 123_456_700)
            .unwrap()
            .to_utc();
        let s = jellyfin_time(dt);
        assert!(!s.ends_with('Z'), "{s}");
        assert!(!s.contains('+'), "{s}");
        // 7 fractional digits, exactly like the reference server.
        assert_eq!(s.split('.').nth(1).unwrap().len(), 7, "{s}");
    }

    #[test]
    fn bitrate_is_none_for_a_zero_length_track() {
        assert_eq!(bitrate_bps(0, 0), None);
        assert_eq!(bitrate_bps(1024, 0), None);
    }

    #[test]
    fn bitrate_is_bits_per_second() {
        // 1 MiB over 60s ≈ 139 kbps.
        assert_eq!(bitrate_bps(1_048_576, 60_000), Some(139_810));
    }
}
