//! XRPC namespace modules — one per `app.rocksky.*` namespace.

pub mod actor;
pub mod album;
pub mod apikey;
pub mod artist;
pub mod charts;
pub mod feed;
pub mod graph;
pub mod like;
pub mod mirror;
pub mod player;
pub mod rockbox;
pub mod playlist;
pub mod scrobble;
pub mod shout;
pub mod song;
pub mod spotify;
pub mod stats;
pub mod storage;

pub use actor::ActorApi;
pub use album::AlbumApi;
pub use apikey::ApikeyApi;
pub use artist::ArtistApi;
pub use charts::ChartsApi;
pub use feed::FeedApi;
pub use graph::GraphApi;
pub use like::LikeApi;
pub use mirror::MirrorApi;
pub use player::PlayerApi;
pub use rockbox::RockboxApi;
pub use playlist::PlaylistApi;
pub use scrobble::ScrobbleApi;
pub use shout::ShoutApi;
pub use song::SongApi;
pub use spotify::SpotifyApi;
pub use stats::StatsApi;
pub use storage::{DropboxApi, GoogleDriveApi};
