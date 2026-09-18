//! The tables this service reads, as `Iden` enums.
//!
//! Same shape as the other services': naming the columns once is what lets
//! the queries be built with sea-query instead of formatted into strings, and
//! that is what makes them run on either backend — the placeholder syntax
//! differs (`?` against `$1`) and the builder should be the only thing that
//! knows which.

use sea_query::Iden;

#[derive(Iden, Clone, Copy)]
#[iden = "mirror_sources"]
pub enum MirrorSources {
    Table,
    #[iden = "user_id"]
    UserId,
    #[iden = "provider"]
    Provider,
    #[iden = "enabled"]
    Enabled,
    #[iden = "external_username"]
    ExternalUsername,
    #[iden = "encrypted_api_key"]
    EncryptedApiKey,
    #[iden = "last_scrobble_seen_at"]
    LastScrobbleSeenAt,
    #[iden = "last_polled_at"]
    LastPolledAt,
    #[iden = "xata_updatedat"]
    XataUpdatedat,
}

#[derive(Iden, Clone, Copy)]
#[iden = "users"]
pub enum Users {
    Table,
    #[iden = "xata_id"]
    XataId,
    #[iden = "did"]
    Did,
}

#[derive(Iden, Clone, Copy)]
#[iden = "tracks"]
pub enum Tracks {
    Table,
    #[iden = "xata_id"]
    XataId,
    #[iden = "title"]
    Title,
    #[iden = "artist"]
    Artist,
    #[iden = "album_art"]
    AlbumArt,
    #[iden = "spotify_link"]
    SpotifyLink,
    #[iden = "isrc"]
    Isrc,
    #[iden = "mb_id"]
    MbId,
    #[iden = "duration"]
    Duration,
    #[iden = "sha256"]
    Sha256,
}

#[derive(Iden, Clone, Copy)]
#[iden = "scrobbles"]
pub enum Scrobbles {
    Table,
    #[iden = "user_id"]
    UserId,
    #[iden = "track_id"]
    TrackId,
    #[iden = "timestamp"]
    Timestamp,
}

#[derive(Iden, Clone, Copy)]
#[iden = "spotify_apps"]
pub enum SpotifyApps {
    Table,
    #[iden = "spotify_app_id"]
    SpotifyAppId,
    #[iden = "spotify_secret"]
    SpotifySecret,
}
