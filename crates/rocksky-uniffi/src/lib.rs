//! UniFFI bindings core for the Rocksky SDK.
//!
//! Wraps the async `rocksky-sdk` behind a synchronous facade (a shared tokio
//! runtime + `block_on`) and exposes it via UniFFI, so the same Rust core powers
//! the Python, Ruby, and Clojure SDKs. Host languages get plain blocking calls
//! and provide their own concurrency.

use std::sync::Arc;

use once_cell::sync::Lazy;

uniffi::setup_scaffolding!();

/// A plain C ABI over the same core (opaque handles + JSON), for languages that
/// bind via a C FFI rather than UniFFI — the fiddle-based Ruby SDK, and Clojure
/// via the JVM Panama FFM API.
pub mod capi;

/// One multi-threaded tokio runtime drives every async SDK call across the FFI
/// boundary. `block_on` from a host (non-runtime) thread is safe here.
pub(crate) static RT: Lazy<tokio::runtime::Runtime> = Lazy::new(|| {
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("tokio runtime")
});

/// Errors surfaced to host languages (one flat message; the SDK's typed errors
/// are stringified at the boundary).
#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum RockskyError {
    #[error("{message}")]
    Generic { message: String },
}

fn err<E: std::fmt::Display>(e: E) -> RockskyError {
    RockskyError::Generic {
        message: e.to_string(),
    }
}

// ---- input records (host -> SDK drafts) ----------------------------------

/// A scrobble to record; fans out to artist/album/song/scrobble.
#[derive(Debug, Clone, Default, uniffi::Record)]
pub struct ScrobbleInput {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_artist: String,
    pub duration_ms: i64,
    #[uniffi(default = None)]
    pub album_art_url: Option<String>,
    #[uniffi(default = None)]
    pub track_number: Option<i64>,
    #[uniffi(default = None)]
    pub disc_number: Option<i64>,
    #[uniffi(default = None)]
    pub year: Option<i64>,
    #[uniffi(default = None)]
    pub release_date: Option<String>,
    #[uniffi(default = None)]
    pub genre: Option<String>,
    #[uniffi(default = [])]
    pub tags: Vec<String>,
    #[uniffi(default = None)]
    pub composer: Option<String>,
    #[uniffi(default = None)]
    pub label: Option<String>,
    #[uniffi(default = None)]
    pub mbid: Option<String>,
    #[uniffi(default = None)]
    pub isrc: Option<String>,
    #[uniffi(default = None)]
    pub spotify_link: Option<String>,
    #[uniffi(default = None)]
    pub youtube_link: Option<String>,
    #[uniffi(default = None)]
    pub tidal_link: Option<String>,
    #[uniffi(default = None)]
    pub apple_music_link: Option<String>,
    /// Play time as Unix seconds (defaults to now; also the dedup timestamp).
    #[uniffi(default = None)]
    pub timestamp: Option<i64>,
}

impl From<ScrobbleInput> for rocksky_sdk::ScrobbleDraft {
    fn from(s: ScrobbleInput) -> Self {
        rocksky_sdk::ScrobbleDraft {
            title: s.title,
            artist: s.artist,
            album: s.album,
            album_artist: s.album_artist,
            duration_ms: s.duration_ms,
            album_art_url: s.album_art_url,
            track_number: s.track_number,
            disc_number: s.disc_number,
            year: s.year,
            release_date: s.release_date,
            genre: s.genre,
            tags: s.tags,
            composer: s.composer,
            label: s.label,
            mbid: s.mbid,
            isrc: s.isrc,
            spotify_link: s.spotify_link,
            youtube_link: s.youtube_link,
            tidal_link: s.tidal_link,
            apple_music_link: s.apple_music_link,
            timestamp: s.timestamp,
        }
    }
}

/// A canonical track record (`app.rocksky.song`).
#[derive(Debug, Clone, Default, uniffi::Record)]
pub struct SongInput {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_artist: String,
    pub duration_ms: i64,
    #[uniffi(default = None)]
    pub album_art_url: Option<String>,
    #[uniffi(default = None)]
    pub track_number: Option<i64>,
    #[uniffi(default = None)]
    pub disc_number: Option<i64>,
    #[uniffi(default = None)]
    pub year: Option<i64>,
    #[uniffi(default = None)]
    pub release_date: Option<String>,
    #[uniffi(default = None)]
    pub genre: Option<String>,
    #[uniffi(default = [])]
    pub tags: Vec<String>,
    #[uniffi(default = None)]
    pub mbid: Option<String>,
    #[uniffi(default = None)]
    pub isrc: Option<String>,
    #[uniffi(default = None)]
    pub spotify_link: Option<String>,
}

impl From<SongInput> for rocksky_sdk::SongDraft {
    fn from(s: SongInput) -> Self {
        rocksky_sdk::SongDraft {
            title: s.title,
            artist: s.artist,
            album: s.album,
            album_artist: s.album_artist,
            duration_ms: s.duration_ms,
            album_art_url: s.album_art_url,
            track_number: s.track_number,
            disc_number: s.disc_number,
            year: s.year,
            release_date: s.release_date,
            genre: s.genre,
            tags: s.tags,
            composer: None,
            label: None,
            mbid: s.mbid,
            isrc: s.isrc,
            spotify_link: s.spotify_link,
        }
    }
}

/// An album record (`app.rocksky.album`); `artist` is the album artist.
#[derive(Debug, Clone, Default, uniffi::Record)]
pub struct AlbumInput {
    pub title: String,
    pub artist: String,
    #[uniffi(default = None)]
    pub year: Option<i64>,
    #[uniffi(default = None)]
    pub release_date: Option<String>,
    #[uniffi(default = None)]
    pub album_art_url: Option<String>,
    #[uniffi(default = None)]
    pub genre: Option<String>,
    #[uniffi(default = [])]
    pub tags: Vec<String>,
    #[uniffi(default = None)]
    pub spotify_link: Option<String>,
}

impl From<AlbumInput> for rocksky_sdk::AlbumDraft {
    fn from(a: AlbumInput) -> Self {
        rocksky_sdk::AlbumDraft {
            title: a.title,
            artist: a.artist,
            year: a.year,
            release_date: a.release_date,
            album_art_url: a.album_art_url,
            genre: a.genre,
            tags: a.tags,
            spotify_link: a.spotify_link,
        }
    }
}

/// An artist record (`app.rocksky.artist`).
#[derive(Debug, Clone, Default, uniffi::Record)]
pub struct ArtistInput {
    pub name: String,
    #[uniffi(default = [])]
    pub tags: Vec<String>,
    #[uniffi(default = None)]
    pub picture_url: Option<String>,
    #[uniffi(default = None)]
    pub bio: Option<String>,
}

impl From<ArtistInput> for rocksky_sdk::ArtistDraft {
    fn from(a: ArtistInput) -> Self {
        rocksky_sdk::ArtistDraft {
            name: a.name,
            tags: a.tags,
            picture_url: a.picture_url,
            bio: a.bio,
        }
    }
}

/// The now-playing track (`app.rocksky.actor.status`).
#[derive(Debug, Clone, Default, uniffi::Record)]
pub struct NowPlayingInput {
    pub name: String,
    pub artist: String,
    #[uniffi(default = None)]
    pub album: Option<String>,
    #[uniffi(default = None)]
    pub album_cover_url: Option<String>,
    #[uniffi(default = None)]
    pub duration_ms: Option<i64>,
    #[uniffi(default = None)]
    pub source: Option<String>,
    #[uniffi(default = None)]
    pub recording_mb_id: Option<String>,
}

impl From<NowPlayingInput> for rocksky_sdk::NowPlaying {
    fn from(t: NowPlayingInput) -> Self {
        rocksky_sdk::NowPlaying {
            name: t.name,
            artist: t.artist,
            album: t.album,
            album_cover_url: t.album_cover_url,
            duration_ms: t.duration_ms,
            source: t.source,
            recording_mb_id: t.recording_mb_id,
            expires_at: None,
        }
    }
}

// ---- output records (SDK -> host) ----------------------------------------

/// The four record URIs a scrobble touches.
#[derive(Debug, Clone, uniffi::Record)]
pub struct ScrobbleResult {
    pub artist_uri: String,
    pub album_uri: String,
    pub song_uri: String,
    pub scrobble_uri: String,
}

impl From<rocksky_sdk::ScrobbleResult> for ScrobbleResult {
    fn from(r: rocksky_sdk::ScrobbleResult) -> Self {
        ScrobbleResult {
            artist_uri: r.artist_uri,
            album_uri: r.album_uri,
            song_uri: r.song_uri,
            scrobble_uri: r.scrobble_uri,
        }
    }
}

/// The locally-cached identity after login.
#[derive(Debug, Clone, uniffi::Record)]
pub struct Profile {
    pub did: String,
    pub handle: String,
    pub display_name: Option<String>,
    pub pds: Option<String>,
    pub method: String,
}

impl From<rocksky_sdk::Profile> for Profile {
    fn from(p: rocksky_sdk::Profile) -> Self {
        Profile {
            did: p.did,
            handle: p.handle,
            display_name: p.display_name,
            pds: p.pds,
            method: p.method,
        }
    }
}

/// `app.rocksky.actor.getProfile`.
#[derive(Debug, Clone, uniffi::Record)]
pub struct ProfileView {
    pub id: Option<String>,
    pub did: Option<String>,
    pub handle: Option<String>,
    pub display_name: Option<String>,
    pub avatar: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

impl From<rocksky_sdk::appview::ProfileView> for ProfileView {
    fn from(p: rocksky_sdk::appview::ProfileView) -> Self {
        ProfileView {
            id: p.id,
            did: p.did,
            handle: p.handle,
            display_name: p.display_name,
            avatar: p.avatar,
            created_at: p.created_at,
            updated_at: p.updated_at,
        }
    }
}

/// A scrobble from the AppView.
#[derive(Debug, Clone, uniffi::Record)]
pub struct ScrobbleView {
    pub id: Option<String>,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album_artist: Option<String>,
    pub album: Option<String>,
    pub album_art: Option<String>,
    pub handle: Option<String>,
    pub did: Option<String>,
    pub avatar: Option<String>,
    pub uri: Option<String>,
    pub track_uri: Option<String>,
    pub artist_uri: Option<String>,
    pub album_uri: Option<String>,
    pub created_at: Option<String>,
    pub liked: Option<bool>,
    pub likes_count: Option<u32>,
}

impl From<rocksky_sdk::appview::ScrobbleView> for ScrobbleView {
    fn from(s: rocksky_sdk::appview::ScrobbleView) -> Self {
        ScrobbleView {
            id: s.id,
            title: s.title,
            artist: s.artist,
            album_artist: s.album_artist,
            album: s.album,
            album_art: s.album_art,
            handle: s.handle,
            did: s.did,
            avatar: s.avatar,
            uri: s.uri,
            track_uri: s.track_uri,
            artist_uri: s.artist_uri,
            album_uri: s.album_uri,
            created_at: s.created_at,
            liked: s.liked,
            likes_count: s.likes_count,
        }
    }
}

/// A song/track from the AppView.
#[derive(Debug, Clone, uniffi::Record)]
pub struct SongView {
    pub id: Option<String>,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album_artist: Option<String>,
    pub album: Option<String>,
    pub album_art: Option<String>,
    pub uri: Option<String>,
    pub duration: Option<u64>,
    pub play_count: Option<u64>,
    pub unique_listeners: Option<u64>,
    pub album_uri: Option<String>,
    pub artist_uri: Option<String>,
    pub mbid: Option<String>,
    pub isrc: Option<String>,
    pub tags: Vec<String>,
    pub created_at: Option<String>,
}

impl From<rocksky_sdk::appview::SongView> for SongView {
    fn from(s: rocksky_sdk::appview::SongView) -> Self {
        SongView {
            id: s.id,
            title: s.title,
            artist: s.artist,
            album_artist: s.album_artist,
            album: s.album,
            album_art: s.album_art,
            uri: s.uri,
            duration: s.duration,
            play_count: s.play_count,
            unique_listeners: s.unique_listeners,
            album_uri: s.album_uri,
            artist_uri: s.artist_uri,
            mbid: s.mbid,
            isrc: s.isrc,
            tags: s.tags,
            created_at: s.created_at,
        }
    }
}

/// An artist from the AppView.
#[derive(Debug, Clone, uniffi::Record)]
pub struct ArtistView {
    pub id: Option<String>,
    pub uri: Option<String>,
    pub name: Option<String>,
    pub picture: Option<String>,
    pub play_count: Option<u64>,
    pub unique_listeners: Option<u64>,
    pub tags: Vec<String>,
}

impl From<rocksky_sdk::appview::ArtistView> for ArtistView {
    fn from(a: rocksky_sdk::appview::ArtistView) -> Self {
        ArtistView {
            id: a.id,
            uri: a.uri,
            name: a.name,
            picture: a.picture,
            play_count: a.play_count,
            unique_listeners: a.unique_listeners,
            tags: a.tags,
        }
    }
}

/// Platform-wide totals.
#[derive(Debug, Clone, uniffi::Record)]
pub struct GlobalStats {
    pub scrobbles: u64,
    pub users: u64,
    pub artists: u64,
    pub albums: u64,
    pub tracks: u64,
}

impl From<rocksky_sdk::appview::GlobalStats> for GlobalStats {
    fn from(s: rocksky_sdk::appview::GlobalStats) -> Self {
        GlobalStats {
            scrobbles: s.scrobbles,
            users: s.users,
            artists: s.artists,
            albums: s.albums,
            tracks: s.tracks,
        }
    }
}

// ---- read client ---------------------------------------------------------

/// Unauthenticated read client over the public Rocksky AppView.
#[derive(uniffi::Object)]
pub struct AppView {
    inner: rocksky_sdk::AppView,
}

#[uniffi::export]
impl AppView {
    #[uniffi::constructor]
    pub fn new(base: Option<String>) -> Arc<Self> {
        let base = base.unwrap_or_else(|| rocksky_sdk::DEFAULT_APPVIEW.to_string());
        Arc::new(Self {
            inner: rocksky_sdk::AppView::new(base),
        })
    }

    pub fn profile(&self, actor: String) -> Result<ProfileView, RockskyError> {
        Ok(RT.block_on(self.inner.profile(&actor)).map_err(err)?.into())
    }

    pub fn scrobbles(
        &self,
        actor: String,
        limit: u32,
        offset: u32,
    ) -> Result<Vec<ScrobbleView>, RockskyError> {
        let out = RT
            .block_on(self.inner.scrobbles(&actor, limit, offset))
            .map_err(err)?;
        Ok(out.into_iter().map(Into::into).collect())
    }

    pub fn songs(
        &self,
        actor: String,
        limit: u32,
        offset: u32,
    ) -> Result<Vec<SongView>, RockskyError> {
        let out = RT
            .block_on(self.inner.songs(&actor, limit, offset))
            .map_err(err)?;
        Ok(out.into_iter().map(Into::into).collect())
    }

    pub fn top_tracks(&self, limit: u32, offset: u32) -> Result<Vec<SongView>, RockskyError> {
        let out = RT
            .block_on(self.inner.top_tracks(limit, offset))
            .map_err(err)?;
        Ok(out.into_iter().map(Into::into).collect())
    }

    pub fn top_artists(&self, limit: u32, offset: u32) -> Result<Vec<ArtistView>, RockskyError> {
        let out = RT
            .block_on(self.inner.top_artists(limit, offset))
            .map_err(err)?;
        Ok(out.into_iter().map(Into::into).collect())
    }

    pub fn global_stats(&self) -> Result<GlobalStats, RockskyError> {
        Ok(RT.block_on(self.inner.global_stats()).map_err(err)?.into())
    }
}

// ---- authenticated agent -------------------------------------------------

/// The Rocksky agent: app-password login + record writes.
#[derive(uniffi::Object)]
pub struct Agent {
    inner: rocksky_sdk::RockskyAgent,
}

#[uniffi::export]
impl Agent {
    /// Log in with an app password, persisting the session at `session_path`.
    /// `dedup_path`, when set, enables the local duplicate-prevention index
    /// (requires the `dedup` feature; ignored otherwise).
    #[uniffi::constructor]
    pub fn login_password(
        session_path: String,
        identifier: String,
        password: String,
        appview: Option<String>,
        dedup_path: Option<String>,
    ) -> Result<Arc<Self>, RockskyError> {
        let mut builder = rocksky_sdk::RockskyAgent::builder().session_store(session_path);
        if let Some(base) = appview {
            builder = builder.appview(base);
        }
        #[cfg(feature = "dedup")]
        if let Some(path) = dedup_path.filter(|p| !p.is_empty()) {
            builder = builder.dedup_store(path);
        }
        #[cfg(not(feature = "dedup"))]
        let _ = &dedup_path;
        let agent = builder.build().map_err(err)?;
        RT.block_on(agent.login_password(&identifier, &password))
            .map_err(err)?;
        Ok(Arc::new(Self { inner: agent }))
    }

    pub fn did(&self) -> Option<String> {
        self.inner.profile().map(|p| p.did)
    }

    pub fn profile(&self) -> Option<Profile> {
        self.inner.profile().map(Into::into)
    }

    /// Proactively refresh the session (keep-alive).
    pub fn refresh_session(&self) -> Result<(), RockskyError> {
        RT.block_on(self.inner.refresh_session()).map_err(err)
    }

    /// Scrobble a play — fans out to artist/album/song then the scrobble.
    pub fn scrobble(&self, input: ScrobbleInput) -> Result<ScrobbleResult, RockskyError> {
        Ok(RT
            .block_on(self.inner.scrobble(&input.into()))
            .map_err(err)?
            .into())
    }

    pub fn create_song(&self, input: SongInput) -> Result<String, RockskyError> {
        RT.block_on(self.inner.create_song(&input.into()))
            .map_err(err)
    }

    pub fn create_album(&self, input: AlbumInput) -> Result<String, RockskyError> {
        RT.block_on(self.inner.create_album(&input.into()))
            .map_err(err)
    }

    pub fn create_artist(&self, input: ArtistInput) -> Result<String, RockskyError> {
        RT.block_on(self.inner.create_artist(&input.into()))
            .map_err(err)
    }

    /// Like a record by strong reference. Returns the like URI.
    pub fn like(&self, uri: String, cid: String) -> Result<String, RockskyError> {
        RT.block_on(self.inner.like(&uri, &cid)).map_err(err)
    }

    pub fn unlike(&self, uri: String) -> Result<(), RockskyError> {
        RT.block_on(self.inner.unlike(&uri)).map_err(err)
    }

    /// Follow an account by DID. Returns the follow URI.
    pub fn follow(&self, did: String) -> Result<String, RockskyError> {
        RT.block_on(self.inner.follow(&did)).map_err(err)
    }

    pub fn unfollow(&self, did: String) -> Result<(), RockskyError> {
        RT.block_on(self.inner.unfollow(&did)).map_err(err)
    }

    /// Post a shout on a subject. Returns the shout URI.
    pub fn shout(
        &self,
        subject_uri: String,
        subject_cid: String,
        message: String,
    ) -> Result<String, RockskyError> {
        RT.block_on(self.inner.shout(&subject_uri, &subject_cid, &message))
            .map_err(err)
    }

    /// Reply to a shout. Returns the shout URI.
    pub fn reply_shout(
        &self,
        subject_uri: String,
        subject_cid: String,
        parent_uri: String,
        parent_cid: String,
        message: String,
    ) -> Result<String, RockskyError> {
        RT.block_on(self.inner.reply_shout(
            &subject_uri,
            &subject_cid,
            &parent_uri,
            &parent_cid,
            &message,
        ))
        .map_err(err)
    }

    /// Set the actor's now-playing status singleton.
    pub fn set_now_playing(&self, track: NowPlayingInput) -> Result<(), RockskyError> {
        RT.block_on(self.inner.set_now_playing(&track.into()))
            .map_err(err)
    }

    /// Delete the actor's now-playing status singleton.
    pub fn clear_now_playing(&self) -> Result<(), RockskyError> {
        RT.block_on(self.inner.clear_now_playing()).map_err(err)
    }
}

/// Duplicate-prevention index operations (the `dedup` feature). Kept in a
/// separate export block so the generated FFI scaffolding is gated with the impl.
#[cfg(feature = "dedup")]
#[uniffi::export]
impl Agent {
    /// Download the caller's repo and (re)build the local dedup index. Returns
    /// the number of records indexed. Requires a dedup store (`dedup_path`).
    pub fn sync_repo(&self) -> Result<u64, RockskyError> {
        let stats = RT.block_on(self.inner.sync_repo()).map_err(err)?;
        Ok(stats.total() as u64)
    }
}

// ---- identity hashes (pure; match the server byte-for-byte) ---------------

#[uniffi::export]
pub fn song_hash(title: String, artist: String, album: String) -> String {
    rocksky_sdk::dedup::song_hash(&title, &artist, &album)
}

#[uniffi::export]
pub fn album_hash(album: String, album_artist: String) -> String {
    rocksky_sdk::dedup::album_hash(&album, &album_artist)
}

#[uniffi::export]
pub fn artist_hash(album_artist: String) -> String {
    rocksky_sdk::dedup::artist_hash(&album_artist)
}
