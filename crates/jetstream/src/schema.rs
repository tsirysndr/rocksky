//! The tables jetstream writes, as sea-query identifiers.
//!
//! Same idea — and the same spellings — as `crates/db/src/schema.rs`, which
//! declares the whole Rocksky schema for the appview. This file carries only
//! what the firehose consumer touches, so the crate does not take a dependency
//! on the appview's data layer (and its SQLite half) just to name a column.
//!
//! The point is the same as it is there: a mistyped string inside a query is a
//! runtime error on a code path nobody exercises until a record of that kind
//! comes down the firehose, whereas a mistyped variant here does not compile.
//!
//! Each enum's `Table` variant renders as the table name; every other variant
//! renders as its column. The `#[iden = "..."]` attributes carry the snake_case
//! spelling, since sea-query's derive would otherwise emit the variant name
//! lowercased as one word (`xataid`, not `xata_id`).

#![allow(clippy::enum_variant_names)]

use sea_query::Iden;

/// `users` (table).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "users"]
pub enum Users {
    Table,
    #[iden = "xata_id"]
    XataId,
    #[iden = "did"]
    Did,
    #[iden = "display_name"]
    DisplayName,
    #[iden = "handle"]
    Handle,
    #[iden = "avatar"]
    Avatar,
}

/// `artists` (table).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "artists"]
pub enum Artists {
    Table,
    #[iden = "xata_id"]
    XataId,
    #[iden = "name"]
    Name,
    #[iden = "picture"]
    Picture,
    #[iden = "sha256"]
    Sha256,
    #[iden = "uri"]
    Uri,
    #[iden = "genres"]
    Genres,
}

/// `albums` (table).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "albums"]
pub enum Albums {
    Table,
    #[iden = "xata_id"]
    XataId,
    #[iden = "title"]
    Title,
    #[iden = "artist"]
    Artist,
    #[iden = "album_art"]
    AlbumArt,
    #[iden = "year"]
    Year,
    #[iden = "release_date"]
    ReleaseDate,
    #[iden = "sha256"]
    Sha256,
    #[iden = "uri"]
    Uri,
    #[iden = "artist_uri"]
    ArtistUri,
}

/// `tracks` (table).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "tracks"]
pub enum Tracks {
    Table,
    #[iden = "xata_id"]
    XataId,
    #[iden = "title"]
    Title,
    #[iden = "artist"]
    Artist,
    #[iden = "album"]
    Album,
    #[iden = "album_art"]
    AlbumArt,
    #[iden = "album_artist"]
    AlbumArtist,
    #[iden = "track_number"]
    TrackNumber,
    #[iden = "duration"]
    Duration,
    #[iden = "mb_id"]
    MbId,
    #[iden = "isrc"]
    Isrc,
    #[iden = "composer"]
    Composer,
    #[iden = "lyrics"]
    Lyrics,
    #[iden = "disc_number"]
    DiscNumber,
    #[iden = "sha256"]
    Sha256,
    #[iden = "copyright_message"]
    CopyrightMessage,
    #[iden = "label"]
    Label,
    #[iden = "uri"]
    Uri,
    #[iden = "album_uri"]
    AlbumUri,
    #[iden = "artist_uri"]
    ArtistUri,
    #[iden = "spotify_link"]
    SpotifyLink,
    #[iden = "apple_music_link"]
    AppleMusicLink,
    #[iden = "tidal_link"]
    TidalLink,
    #[iden = "youtube_link"]
    YoutubeLink,
}

/// `scrobbles` (table).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "scrobbles"]
pub enum Scrobbles {
    Table,
    #[iden = "xata_id"]
    XataId,
    #[iden = "user_id"]
    UserId,
    #[iden = "track_id"]
    TrackId,
    #[iden = "album_id"]
    AlbumId,
    #[iden = "artist_id"]
    ArtistId,
    #[iden = "uri"]
    Uri,
    #[iden = "timestamp"]
    Timestamp,
}

/// `album_tracks` (table).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "album_tracks"]
pub enum AlbumTracks {
    Table,
    #[iden = "xata_id"]
    XataId,
    #[iden = "album_id"]
    AlbumId,
    #[iden = "track_id"]
    TrackId,
}

/// `artist_tracks` (table).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "artist_tracks"]
pub enum ArtistTracks {
    Table,
    #[iden = "xata_id"]
    XataId,
    #[iden = "artist_id"]
    ArtistId,
    #[iden = "track_id"]
    TrackId,
}

/// `artist_albums` (table).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "artist_albums"]
pub enum ArtistAlbums {
    Table,
    #[iden = "xata_id"]
    XataId,
    #[iden = "artist_id"]
    ArtistId,
    #[iden = "album_id"]
    AlbumId,
}

/// `user_artists` (table).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "user_artists"]
pub enum UserArtists {
    Table,
    #[iden = "xata_id"]
    XataId,
    #[iden = "user_id"]
    UserId,
    #[iden = "artist_id"]
    ArtistId,
    #[iden = "uri"]
    Uri,
    #[iden = "scrobbles"]
    Scrobbles,
}

/// `user_albums` (table).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "user_albums"]
pub enum UserAlbums {
    Table,
    #[iden = "xata_id"]
    XataId,
    #[iden = "user_id"]
    UserId,
    #[iden = "album_id"]
    AlbumId,
    #[iden = "uri"]
    Uri,
    #[iden = "scrobbles"]
    Scrobbles,
}

/// `user_tracks` (table).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "user_tracks"]
pub enum UserTracks {
    Table,
    #[iden = "xata_id"]
    XataId,
    #[iden = "user_id"]
    UserId,
    #[iden = "track_id"]
    TrackId,
    #[iden = "uri"]
    Uri,
    #[iden = "scrobbles"]
    Scrobbles,
}

/// `feeds` (table).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "feeds"]
pub enum Feeds {
    Table,
    #[iden = "xata_id"]
    XataId,
    #[iden = "user_id"]
    UserId,
    #[iden = "uri"]
    Uri,
    #[iden = "display_name"]
    DisplayName,
    #[iden = "description"]
    Description,
    #[iden = "did"]
    Did,
    #[iden = "avatar"]
    Avatar,
}

/// `follows` (table).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "follows"]
pub enum Follows {
    Table,
    #[iden = "xata_id"]
    XataId,
    #[iden = "follower_did"]
    FollowerDid,
    #[iden = "subject_did"]
    SubjectDid,
    #[iden = "uri"]
    Uri,
}

/// `playlists` (table).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "playlists"]
pub enum Playlists {
    Table,
    #[iden = "xata_id"]
    XataId,
    #[iden = "name"]
    Name,
    #[iden = "description"]
    Description,
    #[iden = "picture"]
    Picture,
    #[iden = "uri"]
    Uri,
    #[iden = "cid"]
    Cid,
    #[iden = "spotify_link"]
    SpotifyLink,
    #[iden = "tidal_link"]
    TidalLink,
    #[iden = "apple_music_link"]
    AppleMusicLink,
    #[iden = "created_by"]
    CreatedBy,
    #[iden = "xata_updatedat"]
    XataUpdatedat,
}

/// `playlist_tracks` (table).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "playlist_tracks"]
pub enum PlaylistTracks {
    Table,
    #[iden = "xata_id"]
    XataId,
    #[iden = "playlist_id"]
    PlaylistId,
    #[iden = "track_id"]
    TrackId,
    #[iden = "uri"]
    Uri,
    #[iden = "cid"]
    Cid,
    #[iden = "added_by"]
    AddedBy,
    #[iden = "added_at"]
    AddedAt,
}

/// `user_playlists` (table).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "user_playlists"]
pub enum UserPlaylists {
    Table,
    #[iden = "xata_id"]
    XataId,
    #[iden = "user_id"]
    UserId,
    #[iden = "playlist_id"]
    PlaylistId,
    #[iden = "uri"]
    Uri,
}

/// `loved_tracks` (table).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "loved_tracks"]
pub enum LovedTracks {
    Table,
    #[iden = "xata_id"]
    XataId,
    #[iden = "user_id"]
    UserId,
    #[iden = "track_id"]
    TrackId,
    #[iden = "uri"]
    Uri,
    #[iden = "xata_createdat"]
    XataCreatedat,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rendered(iden: impl Iden) -> String {
        let mut out = String::new();
        iden.unquoted(&mut out);
        out
    }

    #[test]
    fn idens_render_as_snake_case() {
        assert_eq!(rendered(Users::Table), "users");
        assert_eq!(rendered(Users::XataId), "xata_id");
        assert_eq!(rendered(Tracks::AlbumArtist), "album_artist");
        assert_eq!(rendered(Tracks::CopyrightMessage), "copyright_message");
        assert_eq!(rendered(Follows::FollowerDid), "follower_did");
        assert_eq!(rendered(PlaylistTracks::Table), "playlist_tracks");
    }
}

/// `events` (table).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "events"]
pub enum Events {
    Table,
    #[iden = "xata_id"]
    XataId,
    #[iden = "uri"]
    Uri,
    #[iden = "cid"]
    Cid,
    #[iden = "music_uri"]
    MusicUri,
    #[iden = "music_cid"]
    MusicCid,
    #[iden = "name"]
    Name,
    #[iden = "description"]
    Description,
    #[iden = "starts_at"]
    StartsAt,
    #[iden = "ends_at"]
    EndsAt,
    #[iden = "mode"]
    Mode,
    #[iden = "status"]
    Status,
    #[iden = "locations"]
    Locations,
    #[iden = "uris"]
    Uris,
    #[iden = "media"]
    Media,
    #[iden = "kind"]
    Kind,
    #[iden = "genre"]
    Genre,
    #[iden = "tags"]
    Tags,
    #[iden = "external_ids"]
    ExternalIds,
    #[iden = "tickets_url"]
    TicketsUrl,
    #[iden = "image_url"]
    ImageUrl,
    #[iden = "created_by"]
    CreatedBy,
    #[iden = "created_at"]
    CreatedAt,
    #[iden = "sha256"]
    Sha256,
    #[iden = "duplicate_of"]
    DuplicateOf,
    #[iden = "xata_createdat"]
    XataCreatedat,
    #[iden = "xata_updatedat"]
    XataUpdatedat,
}

/// `event_artists` (table).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "event_artists"]
pub enum EventArtists {
    Table,
    #[iden = "xata_id"]
    XataId,
    #[iden = "event_id"]
    EventId,
    #[iden = "artist_id"]
    ArtistId,
    #[iden = "name"]
    Name,
    #[iden = "role"]
    Role,
    #[iden = "stage"]
    Stage,
    #[iden = "mbid"]
    Mbid,
    #[iden = "starts_at"]
    StartsAt,
    #[iden = "position"]
    Position,
}

/// `event_rsvps` (table).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "event_rsvps"]
pub enum EventRsvps {
    Table,
    #[iden = "xata_id"]
    XataId,
    #[iden = "event_id"]
    EventId,
    #[iden = "user_id"]
    UserId,
    #[iden = "uri"]
    Uri,
    #[iden = "cid"]
    Cid,
    #[iden = "status"]
    Status,
    #[iden = "xata_updatedat"]
    XataUpdatedat,
}
