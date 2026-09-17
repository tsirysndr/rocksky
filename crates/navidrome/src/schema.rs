//! The schema these compat surfaces read, as sea-query identifiers.
//!
//! Same idea — and the same spellings — as `crates/db/src/schema.rs`, which
//! declares the whole Rocksky schema for the appview. This file carries only
//! the tables the Subsonic and Jellyfin services touch, so that neither crate
//! has to take a dependency on the appview's data layer (and its SQLite half)
//! just to name a column.
//!
//! The point is the same as it is there: a mistyped string inside a query is a
//! runtime error on a code path nobody exercises until a user hits it, whereas
//! a mistyped variant here does not compile.
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

/// `api_keys` (table).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "api_keys"]
pub enum ApiKeys {
    Table,
    #[iden = "api_key"]
    ApiKey,
    #[iden = "enabled"]
    Enabled,
    #[iden = "user_id"]
    UserId,
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
    #[iden = "genres"]
    Genres,
    #[iden = "xata_createdat"]
    XataCreatedat,
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
    #[iden = "year"]
    Year,
    #[iden = "album_art"]
    AlbumArt,
    #[iden = "uri"]
    Uri,
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
    #[iden = "disc_number"]
    DiscNumber,
    #[iden = "duration"]
    Duration,
    #[iden = "mb_id"]
    MbId,
    #[iden = "genre"]
    Genre,
    #[iden = "xata_createdat"]
    XataCreatedat,
}

/// `album_tracks` (table).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "album_tracks"]
pub enum AlbumTracks {
    Table,
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
    #[iden = "artist_id"]
    ArtistId,
    #[iden = "album_id"]
    AlbumId,
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
    #[iden = "sample_rate"]
    SampleRate,
    #[iden = "storage_provider_id"]
    StorageProviderId,
    #[iden = "uploaded_at"]
    UploadedAt,
}

/// `user_storage_providers` (table).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "user_storage_providers"]
pub enum UserStorageProviders {
    Table,
    #[iden = "xata_id"]
    XataId,
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
}

/// `scrobbles` (table).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "scrobbles"]
pub enum Scrobbles {
    Table,
    #[iden = "user_id"]
    UserId,
    #[iden = "track_id"]
    TrackId,
    #[iden = "album_id"]
    AlbumId,
    #[iden = "artist_id"]
    ArtistId,
    #[iden = "timestamp"]
    Timestamp,
}

/// `loved_tracks` (table).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "loved_tracks"]
pub enum LovedTracks {
    Table,
    #[iden = "user_id"]
    UserId,
    #[iden = "track_id"]
    TrackId,
    #[iden = "xata_createdat"]
    XataCreatedat,
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

/// `navidrome_play_queues` (table). Owned by this crate — see
/// [`crate::repo::playqueue::ensure_table`] for the DDL.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "navidrome_play_queues"]
pub enum NavidromePlayQueues {
    Table,
    #[iden = "user_id"]
    UserId,
    #[iden = "track_ids"]
    TrackIds,
    #[iden = "current_track_id"]
    CurrentTrackId,
    #[iden = "position_ms"]
    PositionMs,
    #[iden = "changed_at"]
    ChangedAt,
    #[iden = "changed_by"]
    ChangedBy,
}

#[cfg(test)]
mod tests {
    use super::*;
    use sea_query::{Expr, PostgresQueryBuilder, Query};

    fn rendered(iden: impl sea_query::Iden) -> String {
        let mut out = String::new();
        iden.unquoted(&mut out);
        out
    }

    #[test]
    fn idens_render_as_snake_case() {
        assert_eq!(rendered(Users::Table), "users");
        assert_eq!(rendered(Users::XataId), "xata_id");
        assert_eq!(rendered(Tracks::AlbumArtist), "album_artist");
        assert_eq!(rendered(UserUploads::R2Key), "r2_key");
        assert_eq!(
            rendered(UserUploads::StorageProviderId),
            "storage_provider_id"
        );
        assert_eq!(
            rendered(UserStorageProviders::Table),
            "user_storage_providers"
        );
        assert_eq!(
            rendered(NavidromePlaylistTracks::Table),
            "navidrome_playlist_tracks"
        );
        assert_eq!(
            rendered(NavidromePlayQueues::CurrentTrackId),
            "current_track_id"
        );
    }

    #[test]
    fn a_column_is_quoted_and_qualified() {
        let sql = Query::select()
            .column(Users::Handle)
            .from(Users::Table)
            .and_where(Expr::col((Users::Table, Users::Did)).eq("did:plc:alice"))
            .to_string(PostgresQueryBuilder);
        assert_eq!(
            sql,
            r#"SELECT "handle" FROM "users" WHERE "users"."did" = 'did:plc:alice'"#
        );
    }
}
