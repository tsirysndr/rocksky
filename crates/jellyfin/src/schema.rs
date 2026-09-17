//! The tables this crate owns, as sea-query identifiers.
//!
//! Everything else it reads — the catalogue, `user_uploads`, `loved_tracks` —
//! belongs to the Subsonic crate's [`rocksky_navidrome::schema`] and is used
//! from there, so the two services cannot disagree about a column name.

use sea_query::Iden;

/// `jellyfin_tokens` (table). Created by [`crate::auth::ensure_tables`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "jellyfin_tokens"]
pub enum JellyfinTokens {
    Table,
    #[iden = "token"]
    Token,
    #[iden = "user_id"]
    UserId,
    #[iden = "device_id"]
    DeviceId,
    #[iden = "device_name"]
    DeviceName,
    #[iden = "client"]
    Client,
    #[iden = "created_at"]
    CreatedAt,
}

/// `jellyfin_meta` (table). Created by [`crate::auth::ensure_tables`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "jellyfin_meta"]
pub enum JellyfinMeta {
    Table,
    #[iden = "key"]
    Key,
    #[iden = "value"]
    Value,
}

/// `jellyfin_guids` (table). Created by [`crate::guid::ensure_table`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "jellyfin_guids"]
pub enum JellyfinGuids {
    Table,
    #[iden = "guid"]
    Guid,
    #[iden = "kind"]
    Kind,
    #[iden = "native_id"]
    NativeId,
}

/// `jellyfin_user_item_data` (table). Created by
/// [`crate::userdata::ensure_table`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Iden)]
#[iden = "jellyfin_user_item_data"]
pub enum JellyfinUserItemData {
    Table,
    #[iden = "user_id"]
    UserId,
    #[iden = "item_id"]
    ItemId,
    #[iden = "playback_position_ticks"]
    PlaybackPositionTicks,
    #[iden = "play_count"]
    PlayCount,
    #[iden = "played"]
    Played,
    #[iden = "likes"]
    Likes,
    #[iden = "rating"]
    Rating,
    #[iden = "last_played_date"]
    LastPlayedDate,
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
        assert_eq!(rendered(JellyfinGuids::Table), "jellyfin_guids");
        assert_eq!(rendered(JellyfinGuids::NativeId), "native_id");
        assert_eq!(
            rendered(JellyfinUserItemData::PlaybackPositionTicks),
            "playback_position_ticks"
        );
        assert_eq!(rendered(JellyfinTokens::DeviceName), "device_name");
    }
}
