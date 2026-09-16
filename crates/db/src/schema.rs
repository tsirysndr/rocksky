//! The schema, as sea-query identifiers.
//!
//! Generated from `migrations/0001_init.sql` and checked against it by
//! [`tests::every_table_and_column_is_declared`], so an `Iden` cannot drift
//! from the column it names. That check is the whole point of this file: a
//! mistyped string in a query is a runtime error on a code path nobody
//! exercises until a user hits it, whereas a mistyped variant here does not
//! compile.
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
    #[iden = "is_bot"]
    IsBot,
    #[iden = "bot_flagged_at"]
    BotFlaggedAt,
    #[iden = "bot_reason"]
    BotReason,
    #[iden = "xata_createdat"]
    XataCreatedat,
    #[iden = "xata_updatedat"]
    XataUpdatedat,
    #[iden = "xata_version"]
    XataVersion,
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
    #[iden = "biography"]
    Biography,
    #[iden = "born"]
    Born,
    #[iden = "born_in"]
    BornIn,
    #[iden = "died"]
    Died,
    #[iden = "picture"]
    Picture,
    #[iden = "sha256"]
    Sha256,
    #[iden = "uri"]
    Uri,
    #[iden = "apple_music_link"]
    AppleMusicLink,
    #[iden = "spotify_link"]
    SpotifyLink,
    #[iden = "tidal_link"]
    TidalLink,
    #[iden = "youtube_link"]
    YoutubeLink,
    #[iden = "genres"]
    Genres,
    #[iden = "xata_createdat"]
    XataCreatedat,
    #[iden = "xata_updatedat"]
    XataUpdatedat,
    #[iden = "xata_version"]
    XataVersion,
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
    #[iden = "release_date"]
    ReleaseDate,
    #[iden = "year"]
    Year,
    #[iden = "album_art"]
    AlbumArt,
    #[iden = "uri"]
    Uri,
    #[iden = "artist_uri"]
    ArtistUri,
    #[iden = "apple_music_link"]
    AppleMusicLink,
    #[iden = "spotify_link"]
    SpotifyLink,
    #[iden = "tidal_link"]
    TidalLink,
    #[iden = "youtube_link"]
    YoutubeLink,
    #[iden = "sha256"]
    Sha256,
    #[iden = "xata_createdat"]
    XataCreatedat,
    #[iden = "xata_updatedat"]
    XataUpdatedat,
    #[iden = "xata_version"]
    XataVersion,
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
    #[iden = "album_artist"]
    AlbumArtist,
    #[iden = "album_art"]
    AlbumArt,
    #[iden = "album"]
    Album,
    #[iden = "track_number"]
    TrackNumber,
    #[iden = "duration"]
    Duration,
    #[iden = "mb_id"]
    MbId,
    #[iden = "isrc"]
    Isrc,
    #[iden = "youtube_link"]
    YoutubeLink,
    #[iden = "spotify_link"]
    SpotifyLink,
    #[iden = "apple_music_link"]
    AppleMusicLink,
    #[iden = "tidal_link"]
    TidalLink,
    #[iden = "sha256"]
    Sha256,
    #[iden = "disc_number"]
    DiscNumber,
    #[iden = "lyrics"]
    Lyrics,
    #[iden = "composer"]
    Composer,
    #[iden = "genre"]
    Genre,
    #[iden = "label"]
    Label,
    #[iden = "copyright_message"]
    CopyrightMessage,
    #[iden = "key"]
    Key,
    #[iden = "bpm"]
    Bpm,
    #[iden = "uri"]
    Uri,
    #[iden = "album_uri"]
    AlbumUri,
    #[iden = "artist_uri"]
    ArtistUri,
    #[iden = "xata_createdat"]
    XataCreatedat,
    #[iden = "xata_updatedat"]
    XataUpdatedat,
    #[iden = "xata_version"]
    XataVersion,
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
    #[iden = "xata_createdat"]
    XataCreatedat,
    #[iden = "xata_updatedat"]
    XataUpdatedat,
    #[iden = "xata_version"]
    XataVersion,
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
    #[iden = "xata_createdat"]
    XataCreatedat,
    #[iden = "xata_updatedat"]
    XataUpdatedat,
    #[iden = "xata_version"]
    XataVersion,
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
    #[iden = "xata_createdat"]
    XataCreatedat,
    #[iden = "xata_updatedat"]
    XataUpdatedat,
    #[iden = "xata_version"]
    XataVersion,
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
    #[iden = "xata_createdat"]
    XataCreatedat,
    #[iden = "xata_updatedat"]
    XataUpdatedat,
    #[iden = "xata_version"]
    XataVersion,
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
    #[iden = "xata_createdat"]
    XataCreatedat,
    #[iden = "xata_updatedat"]
    XataUpdatedat,
    #[iden = "xata_version"]
    XataVersion,
    #[iden = "scrobbles"]
    Scrobbles,
    #[iden = "uri"]
    Uri,
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
    #[iden = "xata_createdat"]
    XataCreatedat,
    #[iden = "xata_updatedat"]
    XataUpdatedat,
    #[iden = "xata_version"]
    XataVersion,
    #[iden = "scrobbles"]
    Scrobbles,
    #[iden = "uri"]
    Uri,
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
    #[iden = "xata_createdat"]
    XataCreatedat,
    #[iden = "xata_updatedat"]
    XataUpdatedat,
    #[iden = "xata_version"]
    XataVersion,
    #[iden = "uri"]
    Uri,
    #[iden = "scrobbles"]
    Scrobbles,
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

/// `follows` (table).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "follows"]
pub enum Follows {
    Table,
    #[iden = "xata_id"]
    XataId,
    #[iden = "uri"]
    Uri,
    #[iden = "follower_did"]
    FollowerDid,
    #[iden = "subject_did"]
    SubjectDid,
    #[iden = "xata_version"]
    XataVersion,
    #[iden = "xata_createdat"]
    XataCreatedat,
    #[iden = "xata_updatedat"]
    XataUpdatedat,
}

/// `feeds` (table).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "feeds"]
pub enum Feeds {
    Table,
    #[iden = "xata_id"]
    XataId,
    #[iden = "display_name"]
    DisplayName,
    #[iden = "description"]
    Description,
    #[iden = "did"]
    Did,
    #[iden = "uri"]
    Uri,
    #[iden = "avatar"]
    Avatar,
    #[iden = "user_id"]
    UserId,
    #[iden = "xata_version"]
    XataVersion,
    #[iden = "xata_createdat"]
    XataCreatedat,
    #[iden = "xata_updatedat"]
    XataUpdatedat,
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
    #[iden = "picture"]
    Picture,
    #[iden = "description"]
    Description,
    #[iden = "uri"]
    Uri,
    #[iden = "cid"]
    Cid,
    #[iden = "collaborators"]
    Collaborators,
    #[iden = "spotify_link"]
    SpotifyLink,
    #[iden = "tidal_link"]
    TidalLink,
    #[iden = "apple_music_link"]
    AppleMusicLink,
    #[iden = "created_by"]
    CreatedBy,
    #[iden = "xata_createdat"]
    XataCreatedat,
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
    #[iden = "xata_createdat"]
    XataCreatedat,
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
    #[iden = "xata_createdat"]
    XataCreatedat,
    #[iden = "uri"]
    Uri,
}

/// `navidrome_playlists` (table).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "navidrome_playlists"]
pub enum NavidromePlaylists {
    Table,
    #[iden = "xata_id"]
    XataId,
    #[iden = "name"]
    Name,
    #[iden = "description"]
    Description,
    #[iden = "uri"]
    Uri,
    #[iden = "user_id"]
    UserId,
    #[iden = "xata_createdat"]
    XataCreatedat,
    #[iden = "xata_updatedat"]
    XataUpdatedat,
}

/// `navidrome_playlist_tracks` (table).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "navidrome_playlist_tracks"]
pub enum NavidromePlaylistTracks {
    Table,
    #[iden = "xata_id"]
    XataId,
    #[iden = "playlist_id"]
    PlaylistId,
    #[iden = "track_id"]
    TrackId,
    #[iden = "xata_createdat"]
    XataCreatedat,
}

/// `shouts` (table).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "shouts"]
pub enum Shouts {
    Table,
    #[iden = "xata_id"]
    XataId,
    #[iden = "content"]
    Content,
    #[iden = "track_id"]
    TrackId,
    #[iden = "artist_id"]
    ArtistId,
    #[iden = "album_id"]
    AlbumId,
    #[iden = "scrobble_id"]
    ScrobbleId,
    #[iden = "uri"]
    Uri,
    #[iden = "author_id"]
    AuthorId,
    #[iden = "parent_id"]
    ParentId,
    #[iden = "gif_url"]
    GifUrl,
    #[iden = "gif_preview_url"]
    GifPreviewUrl,
    #[iden = "gif_alt"]
    GifAlt,
    #[iden = "gif_width"]
    GifWidth,
    #[iden = "gif_height"]
    GifHeight,
    #[iden = "facets"]
    Facets,
    #[iden = "xata_createdat"]
    XataCreatedat,
    #[iden = "xata_updatedat"]
    XataUpdatedat,
}

/// `shout_likes` (table).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "shout_likes"]
pub enum ShoutLikes {
    Table,
    #[iden = "xata_id"]
    XataId,
    #[iden = "user_id"]
    UserId,
    #[iden = "shout_id"]
    ShoutId,
    #[iden = "xata_createdat"]
    XataCreatedat,
    #[iden = "uri"]
    Uri,
}

/// `shout_reports` (table).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "shout_reports"]
pub enum ShoutReports {
    Table,
    #[iden = "xata_id"]
    XataId,
    #[iden = "user_id"]
    UserId,
    #[iden = "shout_id"]
    ShoutId,
    #[iden = "xata_createdat"]
    XataCreatedat,
}

/// `profile_shouts` (table).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "profile_shouts"]
pub enum ProfileShouts {
    Table,
    #[iden = "xata_id"]
    XataId,
    #[iden = "user_id"]
    UserId,
    #[iden = "shout_id"]
    ShoutId,
    #[iden = "xata_createdat"]
    XataCreatedat,
}

/// `notifications` (table).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "notifications"]
pub enum Notifications {
    Table,
    #[iden = "xata_id"]
    XataId,
    #[iden = "user_id"]
    UserId,
    #[iden = "actor_id"]
    ActorId,
    #[iden = "type"]
    Type,
    #[iden = "shout_id"]
    ShoutId,
    #[iden = "subject_uri"]
    SubjectUri,
    #[iden = "read"]
    Read,
    #[iden = "read_at"]
    ReadAt,
    #[iden = "xata_createdat"]
    XataCreatedat,
}

/// `api_keys` (table).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "api_keys"]
pub enum ApiKeys {
    Table,
    #[iden = "xata_id"]
    XataId,
    #[iden = "name"]
    Name,
    #[iden = "api_key"]
    ApiKey,
    #[iden = "shared_secret"]
    SharedSecret,
    #[iden = "description"]
    Description,
    #[iden = "enabled"]
    Enabled,
    #[iden = "user_id"]
    UserId,
    #[iden = "xata_createdat"]
    XataCreatedat,
    #[iden = "xata_updatedat"]
    XataUpdatedat,
}

/// `access_tokens` (table).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "access_tokens"]
pub enum AccessTokens {
    Table,
    #[iden = "xata_id"]
    XataId,
    #[iden = "user_id"]
    UserId,
    #[iden = "name"]
    Name,
    #[iden = "jti"]
    Jti,
    #[iden = "token_encrypted"]
    TokenEncrypted,
    #[iden = "last_four"]
    LastFour,
    #[iden = "last_used_at"]
    LastUsedAt,
    #[iden = "xata_createdat"]
    XataCreatedat,
    #[iden = "xata_updatedat"]
    XataUpdatedat,
}

/// `webscrobblers` (table).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "webscrobblers"]
pub enum Webscrobblers {
    Table,
    #[iden = "xata_id"]
    XataId,
    #[iden = "name"]
    Name,
    #[iden = "uuid"]
    Uuid,
    #[iden = "description"]
    Description,
    #[iden = "enabled"]
    Enabled,
    #[iden = "user_id"]
    UserId,
    #[iden = "xata_createdat"]
    XataCreatedat,
    #[iden = "xata_updatedat"]
    XataUpdatedat,
}

/// `mirror_sources` (table).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "mirror_sources"]
pub enum MirrorSources {
    Table,
    #[iden = "xata_id"]
    XataId,
    #[iden = "user_id"]
    UserId,
    #[iden = "provider"]
    Provider,
    #[iden = "enabled"]
    Enabled,
    #[iden = "push_enabled"]
    PushEnabled,
    #[iden = "external_username"]
    ExternalUsername,
    #[iden = "encrypted_api_key"]
    EncryptedApiKey,
    #[iden = "last_polled_at"]
    LastPolledAt,
    #[iden = "last_scrobble_seen_at"]
    LastScrobbleSeenAt,
    #[iden = "xata_createdat"]
    XataCreatedat,
    #[iden = "xata_updatedat"]
    XataUpdatedat,
    #[iden = "xata_version"]
    XataVersion,
}

/// `import_jobs` (table).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "import_jobs"]
pub enum ImportJobs {
    Table,
    #[iden = "xata_id"]
    XataId,
    #[iden = "user_id"]
    UserId,
    #[iden = "type"]
    Type,
    #[iden = "status"]
    Status,
    #[iden = "total"]
    Total,
    #[iden = "processed"]
    Processed,
    #[iden = "failed"]
    Failed,
    #[iden = "errors"]
    Errors,
    #[iden = "xata_createdat"]
    XataCreatedat,
    #[iden = "xata_updatedat"]
    XataUpdatedat,
    #[iden = "xata_version"]
    XataVersion,
}

/// `queue_tracks` (table).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "queue_tracks"]
pub enum QueueTracks {
    Table,
    #[iden = "xata_id"]
    XataId,
    #[iden = "user_id"]
    UserId,
    #[iden = "track_id"]
    TrackId,
    #[iden = "position"]
    Position,
    #[iden = "file_uri"]
    FileUri,
    #[iden = "xata_version"]
    XataVersion,
    #[iden = "xata_createdat"]
    XataCreatedat,
    #[iden = "xata_updatedat"]
    XataUpdatedat,
}

/// `user_storage_providers` (table).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "user_storage_providers"]
pub enum UserStorageProviders {
    Table,
    #[iden = "xata_id"]
    XataId,
    #[iden = "user_id"]
    UserId,
    #[iden = "label"]
    Label,
    #[iden = "endpoint"]
    Endpoint,
    #[iden = "region"]
    Region,
    #[iden = "bucket"]
    Bucket,
    #[iden = "access_key"]
    AccessKey,
    #[iden = "secret_key"]
    SecretKey,
    #[iden = "public_url"]
    PublicUrl,
    #[iden = "verified_at"]
    VerifiedAt,
    #[iden = "xata_createdat"]
    XataCreatedat,
    #[iden = "xata_updatedat"]
    XataUpdatedat,
    #[iden = "xata_version"]
    XataVersion,
}

/// `user_uploads` (table).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "user_uploads"]
pub enum UserUploads {
    Table,
    #[iden = "xata_id"]
    XataId,
    #[iden = "user_id"]
    UserId,
    #[iden = "track_id"]
    TrackId,
    #[iden = "r2_key"]
    R2Key,
    #[iden = "mime_type"]
    MimeType,
    #[iden = "file_size"]
    FileSize,
    #[iden = "original_filename"]
    OriginalFilename,
    #[iden = "sample_rate"]
    SampleRate,
    #[iden = "storage_provider_id"]
    StorageProviderId,
    #[iden = "uploaded_at"]
    UploadedAt,
    #[iden = "xata_createdat"]
    XataCreatedat,
    #[iden = "xata_updatedat"]
    XataUpdatedat,
    #[iden = "xata_version"]
    XataVersion,
}

/// `upload_queue_state` (table).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "upload_queue_state"]
pub enum UploadQueueState {
    Table,
    #[iden = "xata_id"]
    XataId,
    #[iden = "user_id"]
    UserId,
    #[iden = "upload_ids"]
    UploadIds,
    #[iden = "current_index"]
    CurrentIndex,
    #[iden = "xata_createdat"]
    XataCreatedat,
    #[iden = "xata_updatedat"]
    XataUpdatedat,
    #[iden = "xata_version"]
    XataVersion,
}

/// `spotify_apps` (table).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "spotify_apps"]
pub enum SpotifyApps {
    Table,
    #[iden = "xata_id"]
    XataId,
    #[iden = "xata_version"]
    XataVersion,
    #[iden = "spotify_app_id"]
    SpotifyAppId,
    #[iden = "spotify_secret"]
    SpotifySecret,
    #[iden = "xata_createdat"]
    XataCreatedat,
    #[iden = "xata_updatedat"]
    XataUpdatedat,
}

/// `spotify_accounts` (table).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "spotify_accounts"]
pub enum SpotifyAccounts {
    Table,
    #[iden = "xata_id"]
    XataId,
    #[iden = "xata_version"]
    XataVersion,
    #[iden = "email"]
    Email,
    #[iden = "user_id"]
    UserId,
    #[iden = "is_beta_user"]
    IsBetaUser,
    #[iden = "spotify_app_id"]
    SpotifyAppId,
    #[iden = "xata_createdat"]
    XataCreatedat,
    #[iden = "xata_updatedat"]
    XataUpdatedat,
}

/// `spotify_tokens` (table).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "spotify_tokens"]
pub enum SpotifyTokens {
    Table,
    #[iden = "xata_id"]
    XataId,
    #[iden = "xata_version"]
    XataVersion,
    #[iden = "access_token"]
    AccessToken,
    #[iden = "refresh_token"]
    RefreshToken,
    #[iden = "user_id"]
    UserId,
    #[iden = "spotify_app_id"]
    SpotifyAppId,
    #[iden = "xata_createdat"]
    XataCreatedat,
    #[iden = "xata_updatedat"]
    XataUpdatedat,
}

/// `user_artists_mv` (view).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "user_artists_mv"]
pub enum UserArtistsMv {
    Table,
    #[iden = "user_id"]
    UserId,
    #[iden = "artist_id"]
    ArtistId,
    #[iden = "play_count"]
    PlayCount,
}

/// `top_scrobblers_mv` (view).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "top_scrobblers_mv"]
pub enum TopScrobblersMv {
    Table,
    #[iden = "user_id"]
    UserId,
    #[iden = "scrobbles"]
    Scrobbles,
    #[iden = "unique_artists"]
    UniqueArtists,
    #[iden = "unique_tracks"]
    UniqueTracks,
}

#[cfg(test)]
mod tests {
    use super::*;
    use sea_query::SqliteQueryBuilder;

    /// Every table and column in the migration, as the generator read it.
    const EXPECTED: &[(&str, &[&str])] = &[
        (
            "users",
            &[
                "xata_id",
                "did",
                "display_name",
                "handle",
                "avatar",
                "is_bot",
                "bot_flagged_at",
                "bot_reason",
                "xata_createdat",
                "xata_updatedat",
                "xata_version",
            ],
        ),
        (
            "artists",
            &[
                "xata_id",
                "name",
                "biography",
                "born",
                "born_in",
                "died",
                "picture",
                "sha256",
                "uri",
                "apple_music_link",
                "spotify_link",
                "tidal_link",
                "youtube_link",
                "genres",
                "xata_createdat",
                "xata_updatedat",
                "xata_version",
            ],
        ),
        (
            "albums",
            &[
                "xata_id",
                "title",
                "artist",
                "release_date",
                "year",
                "album_art",
                "uri",
                "artist_uri",
                "apple_music_link",
                "spotify_link",
                "tidal_link",
                "youtube_link",
                "sha256",
                "xata_createdat",
                "xata_updatedat",
                "xata_version",
            ],
        ),
        (
            "tracks",
            &[
                "xata_id",
                "title",
                "artist",
                "album_artist",
                "album_art",
                "album",
                "track_number",
                "duration",
                "mb_id",
                "isrc",
                "youtube_link",
                "spotify_link",
                "apple_music_link",
                "tidal_link",
                "sha256",
                "disc_number",
                "lyrics",
                "composer",
                "genre",
                "label",
                "copyright_message",
                "key",
                "bpm",
                "uri",
                "album_uri",
                "artist_uri",
                "xata_createdat",
                "xata_updatedat",
                "xata_version",
            ],
        ),
        (
            "scrobbles",
            &[
                "xata_id",
                "user_id",
                "track_id",
                "album_id",
                "artist_id",
                "uri",
                "xata_createdat",
                "xata_updatedat",
                "xata_version",
                "timestamp",
            ],
        ),
        (
            "album_tracks",
            &[
                "xata_id",
                "album_id",
                "track_id",
                "xata_createdat",
                "xata_updatedat",
                "xata_version",
            ],
        ),
        (
            "artist_albums",
            &[
                "xata_id",
                "artist_id",
                "album_id",
                "xata_createdat",
                "xata_updatedat",
                "xata_version",
            ],
        ),
        (
            "artist_tracks",
            &[
                "xata_id",
                "artist_id",
                "track_id",
                "xata_createdat",
                "xata_updatedat",
                "xata_version",
            ],
        ),
        (
            "user_albums",
            &[
                "xata_id",
                "user_id",
                "album_id",
                "xata_createdat",
                "xata_updatedat",
                "xata_version",
                "scrobbles",
                "uri",
            ],
        ),
        (
            "user_artists",
            &[
                "xata_id",
                "user_id",
                "artist_id",
                "xata_createdat",
                "xata_updatedat",
                "xata_version",
                "scrobbles",
                "uri",
            ],
        ),
        (
            "user_tracks",
            &[
                "xata_id",
                "user_id",
                "track_id",
                "xata_createdat",
                "xata_updatedat",
                "xata_version",
                "uri",
                "scrobbles",
            ],
        ),
        (
            "loved_tracks",
            &["xata_id", "user_id", "track_id", "uri", "xata_createdat"],
        ),
        (
            "follows",
            &[
                "xata_id",
                "uri",
                "follower_did",
                "subject_did",
                "xata_version",
                "xata_createdat",
                "xata_updatedat",
            ],
        ),
        (
            "feeds",
            &[
                "xata_id",
                "display_name",
                "description",
                "did",
                "uri",
                "avatar",
                "user_id",
                "xata_version",
                "xata_createdat",
                "xata_updatedat",
            ],
        ),
        (
            "playlists",
            &[
                "xata_id",
                "name",
                "picture",
                "description",
                "uri",
                "cid",
                "collaborators",
                "spotify_link",
                "tidal_link",
                "apple_music_link",
                "created_by",
                "xata_createdat",
                "xata_updatedat",
            ],
        ),
        (
            "playlist_tracks",
            &[
                "xata_id",
                "playlist_id",
                "track_id",
                "uri",
                "cid",
                "added_by",
                "added_at",
                "xata_createdat",
            ],
        ),
        (
            "user_playlists",
            &["xata_id", "user_id", "playlist_id", "xata_createdat", "uri"],
        ),
        (
            "navidrome_playlists",
            &[
                "xata_id",
                "name",
                "description",
                "uri",
                "user_id",
                "xata_createdat",
                "xata_updatedat",
            ],
        ),
        (
            "navidrome_playlist_tracks",
            &["xata_id", "playlist_id", "track_id", "xata_createdat"],
        ),
        (
            "shouts",
            &[
                "xata_id",
                "content",
                "track_id",
                "artist_id",
                "album_id",
                "scrobble_id",
                "uri",
                "author_id",
                "parent_id",
                "gif_url",
                "gif_preview_url",
                "gif_alt",
                "gif_width",
                "gif_height",
                "facets",
                "xata_createdat",
                "xata_updatedat",
            ],
        ),
        (
            "shout_likes",
            &["xata_id", "user_id", "shout_id", "xata_createdat", "uri"],
        ),
        (
            "shout_reports",
            &["xata_id", "user_id", "shout_id", "xata_createdat"],
        ),
        (
            "profile_shouts",
            &["xata_id", "user_id", "shout_id", "xata_createdat"],
        ),
        (
            "notifications",
            &[
                "xata_id",
                "user_id",
                "actor_id",
                "type",
                "shout_id",
                "subject_uri",
                "read",
                "read_at",
                "xata_createdat",
            ],
        ),
        (
            "api_keys",
            &[
                "xata_id",
                "name",
                "api_key",
                "shared_secret",
                "description",
                "enabled",
                "user_id",
                "xata_createdat",
                "xata_updatedat",
            ],
        ),
        (
            "access_tokens",
            &[
                "xata_id",
                "user_id",
                "name",
                "jti",
                "token_encrypted",
                "last_four",
                "last_used_at",
                "xata_createdat",
                "xata_updatedat",
            ],
        ),
        (
            "webscrobblers",
            &[
                "xata_id",
                "name",
                "uuid",
                "description",
                "enabled",
                "user_id",
                "xata_createdat",
                "xata_updatedat",
            ],
        ),
        (
            "mirror_sources",
            &[
                "xata_id",
                "user_id",
                "provider",
                "enabled",
                "push_enabled",
                "external_username",
                "encrypted_api_key",
                "last_polled_at",
                "last_scrobble_seen_at",
                "xata_createdat",
                "xata_updatedat",
                "xata_version",
            ],
        ),
        (
            "import_jobs",
            &[
                "xata_id",
                "user_id",
                "type",
                "status",
                "total",
                "processed",
                "failed",
                "errors",
                "xata_createdat",
                "xata_updatedat",
                "xata_version",
            ],
        ),
        (
            "queue_tracks",
            &[
                "xata_id",
                "user_id",
                "track_id",
                "position",
                "file_uri",
                "xata_version",
                "xata_createdat",
                "xata_updatedat",
            ],
        ),
        (
            "user_storage_providers",
            &[
                "xata_id",
                "user_id",
                "label",
                "endpoint",
                "region",
                "bucket",
                "access_key",
                "secret_key",
                "public_url",
                "verified_at",
                "xata_createdat",
                "xata_updatedat",
                "xata_version",
            ],
        ),
        (
            "user_uploads",
            &[
                "xata_id",
                "user_id",
                "track_id",
                "r2_key",
                "mime_type",
                "file_size",
                "original_filename",
                "sample_rate",
                "storage_provider_id",
                "uploaded_at",
                "xata_createdat",
                "xata_updatedat",
                "xata_version",
            ],
        ),
        (
            "upload_queue_state",
            &[
                "xata_id",
                "user_id",
                "upload_ids",
                "current_index",
                "xata_createdat",
                "xata_updatedat",
                "xata_version",
            ],
        ),
        (
            "spotify_apps",
            &[
                "xata_id",
                "xata_version",
                "spotify_app_id",
                "spotify_secret",
                "xata_createdat",
                "xata_updatedat",
            ],
        ),
        (
            "spotify_accounts",
            &[
                "xata_id",
                "xata_version",
                "email",
                "user_id",
                "is_beta_user",
                "spotify_app_id",
                "xata_createdat",
                "xata_updatedat",
            ],
        ),
        (
            "spotify_tokens",
            &[
                "xata_id",
                "xata_version",
                "access_token",
                "refresh_token",
                "user_id",
                "spotify_app_id",
                "xata_createdat",
                "xata_updatedat",
            ],
        ),
        ("user_artists_mv", &["user_id", "artist_id", "play_count"]),
        (
            "top_scrobblers_mv",
            &["user_id", "scrobbles", "unique_artists", "unique_tracks"],
        ),
    ];

    /// Renders one identifier the way a query would.
    fn rendered(iden: impl sea_query::Iden) -> String {
        iden.to_string()
    }

    /// The check that makes this file trustworthy: the migration is parsed
    /// again here, and every table and column it declares must be present with
    /// the same spelling. Adding a column to the schema without adding it here
    /// fails this test rather than producing a query that cannot name it.
    #[test]
    fn every_table_and_column_is_declared() {
        let migration = include_str!("../migrations/0001_init.sql");
        let stripped: String = migration
            .lines()
            .map(|line| line.split("--").next().unwrap_or(""))
            .collect::<Vec<_>>()
            .join("\n");

        let mut missing = Vec::new();
        let mut found_tables = 0;

        for (table, columns) in EXPECTED {
            let header = format!("CREATE TABLE IF NOT EXISTS {table} (");
            let view = format!("CREATE VIEW IF NOT EXISTS {table} AS");
            let Some(start) = stripped
                .find(&header)
                .map(|at| at + header.len())
                .or_else(|| stripped.find(&view).map(|at| at + view.len()))
            else {
                missing.push(format!("{table} is declared here but not in the migration"));
                continue;
            };
            found_tables += 1;

            let body = &stripped[start..];
            let body = &body[..body.find("\n);").unwrap_or(body.len())];

            for column in *columns {
                // A word boundary on both sides: `user_id` must not match
                // inside `user_uploads`.
                let present = body
                    .split(|c: char| !c.is_alphanumeric() && c != '_')
                    .any(|word| word == *column);
                if !present {
                    missing.push(format!("{table}.{column} is not in the migration"));
                }
            }
        }

        assert!(missing.is_empty(), "{missing:#?}");
        assert_eq!(found_tables, EXPECTED.len());
    }

    /// The `#[iden]` attributes must survive into the rendered SQL, or every
    /// snake_case column would be queried as one lowercased word.
    #[test]
    fn columns_render_with_their_snake_case_names() {
        assert_eq!(rendered(Users::XataId), "xata_id");
        assert_eq!(rendered(Users::DisplayName), "display_name");
        assert_eq!(rendered(Tracks::AlbumArtist), "album_artist");
        assert_eq!(
            rendered(UserUploads::StorageProviderId),
            "storage_provider_id"
        );

        // And the table variant names the table, not the word "table".
        assert_eq!(rendered(Users::Table), "users");
        assert_eq!(rendered(UserUploads::Table), "user_uploads");
        assert_eq!(rendered(UserArtistsMv::Table), "user_artists_mv");
    }

    /// A whole statement, to prove the identifiers compose.
    #[test]
    fn a_statement_quotes_every_identifier() {
        let sql = sea_query::Query::select()
            .column(Users::Handle)
            .from(Users::Table)
            .and_where(sea_query::Expr::col(Users::Did).eq("did:plc:alice"))
            .to_string(SqliteQueryBuilder);

        assert_eq!(
            sql,
            r#"SELECT "handle" FROM "users" WHERE "did" = 'did:plc:alice'"#
        );
    }
}
