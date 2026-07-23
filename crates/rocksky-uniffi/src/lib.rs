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
// `reason` (not `message`): UniFFI's Kotlin backend maps error variants to
// exception subclasses, where a `message` field would clash with
// `kotlin.Throwable.message`.
#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum RockskyError {
    #[error("{reason}")]
    Generic { reason: String },
}

fn err<E: std::fmt::Display>(e: E) -> RockskyError {
    RockskyError::Generic {
        reason: e.to_string(),
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

/// Input for `Agent.scrobble_match` — `title` + `artist` required, the rest
/// optional (album override, mbId/isrc match anchors, scrobbled-at timestamp).
#[derive(Debug, Clone, Default, uniffi::Record)]
pub struct ScrobbleMatchInput {
    pub title: String,
    pub artist: String,
    #[uniffi(default = None)]
    pub album: Option<String>,
    #[uniffi(default = None)]
    pub mb_id: Option<String>,
    #[uniffi(default = None)]
    pub isrc: Option<String>,
    /// Scrobbled-at Unix seconds; `None` = now.
    #[uniffi(default = None)]
    pub timestamp: Option<i64>,
}

impl From<ScrobbleMatchInput> for rocksky_sdk::ScrobbleMatch {
    fn from(s: ScrobbleMatchInput) -> Self {
        rocksky_sdk::ScrobbleMatch {
            title: s.title,
            artist: s.artist,
            album: s.album,
            mb_id: s.mb_id,
            isrc: s.isrc,
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
    pub track_number: Option<u32>,
    pub disc_number: Option<u32>,
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
            track_number: s.track_number,
            disc_number: s.disc_number,
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
    pub genres: Vec<String>,
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
            genres: a.genres,
        }
    }
}

/// An album from the AppView.
#[derive(Debug, Clone, uniffi::Record)]
pub struct AlbumView {
    pub id: Option<String>,
    pub uri: Option<String>,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub artist_uri: Option<String>,
    pub year: Option<u32>,
    pub album_art: Option<String>,
    pub release_date: Option<String>,
    pub sha256: Option<String>,
    pub play_count: Option<u64>,
    pub unique_listeners: Option<u64>,
}

impl From<rocksky_sdk::appview::AlbumView> for AlbumView {
    fn from(a: rocksky_sdk::appview::AlbumView) -> Self {
        AlbumView {
            id: a.id,
            uri: a.uri,
            title: a.title,
            artist: a.artist,
            artist_uri: a.artist_uri,
            year: a.year,
            album_art: a.album_art,
            release_date: a.release_date,
            sha256: a.sha256,
            play_count: a.play_count,
            unique_listeners: a.unique_listeners,
        }
    }
}

/// A typed date window for the `top_*` charts. `Range` bounds are RFC-3339
/// datetimes (e.g. `2026-01-01T00:00:00Z`).
#[derive(Debug, Clone, uniffi::Enum)]
pub enum DateInterval {
    AllTime,
    LastDays { days: u32 },
    LastWeeks { weeks: u32 },
    LastMonths { months: u32 },
    LastYears { years: u32 },
    Range { start: String, end: String },
}

impl DateInterval {
    fn to_core(self) -> Result<rocksky_sdk::DateInterval, RockskyError> {
        use rocksky_sdk::DateInterval as C;
        Ok(match self {
            DateInterval::AllTime => C::AllTime,
            DateInterval::LastDays { days } => C::LastDays(days),
            DateInterval::LastWeeks { weeks } => C::LastWeeks(weeks),
            DateInterval::LastMonths { months } => C::LastMonths(months),
            DateInterval::LastYears { years } => C::LastYears(years),
            DateInterval::Range { start, end } => C::Range {
                start: start.parse().map_err(err)?,
                end: end.parse().map_err(err)?,
            },
        })
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
    /// `token`, when set, is sent as `Authorization: Bearer <token>` on every
    /// read — needed only for auth-gated queries.
    #[uniffi::constructor]
    pub fn new(base: Option<String>, token: Option<String>) -> Arc<Self> {
        let base = base.unwrap_or_else(|| rocksky_sdk::DEFAULT_APPVIEW.to_string());
        let mut inner = rocksky_sdk::AppView::new(base);
        if let Some(t) = token.filter(|t| !t.is_empty()) {
            inner.set_token(Some(t));
        }
        Arc::new(Self { inner })
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

    pub fn albums(
        &self,
        actor: String,
        limit: u32,
        offset: u32,
    ) -> Result<Vec<AlbumView>, RockskyError> {
        let out = RT
            .block_on(self.inner.albums(&actor, limit, offset))
            .map_err(err)?;
        Ok(out.into_iter().map(Into::into).collect())
    }

    pub fn artists(
        &self,
        actor: String,
        limit: u32,
        offset: u32,
    ) -> Result<Vec<ArtistView>, RockskyError> {
        let out = RT
            .block_on(self.inner.artists(&actor, limit, offset))
            .map_err(err)?;
        Ok(out.into_iter().map(Into::into).collect())
    }

    pub fn loved_songs(
        &self,
        actor: String,
        limit: u32,
        offset: u32,
    ) -> Result<Vec<SongView>, RockskyError> {
        let out = RT
            .block_on(self.inner.loved_songs(&actor, limit, offset))
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

    /// Top tracks over a typed [`DateInterval`].
    pub fn top_tracks_interval(
        &self,
        limit: u32,
        offset: u32,
        interval: DateInterval,
    ) -> Result<Vec<SongView>, RockskyError> {
        let out = RT
            .block_on(
                self.inner
                    .top_tracks_interval(limit, offset, interval.to_core()?),
            )
            .map_err(err)?;
        Ok(out.into_iter().map(Into::into).collect())
    }

    /// Top artists over a typed [`DateInterval`].
    pub fn top_artists_interval(
        &self,
        limit: u32,
        offset: u32,
        interval: DateInterval,
    ) -> Result<Vec<ArtistView>, RockskyError> {
        let out = RT
            .block_on(
                self.inner
                    .top_artists_interval(limit, offset, interval.to_core()?),
            )
            .map_err(err)?;
        Ok(out.into_iter().map(Into::into).collect())
    }

    pub fn catalog_albums(
        &self,
        limit: u32,
        offset: u32,
        genre: Option<String>,
    ) -> Result<Vec<AlbumView>, RockskyError> {
        let out = RT
            .block_on(self.inner.catalog_albums(limit, offset, genre.as_deref()))
            .map_err(err)?;
        Ok(out.into_iter().map(Into::into).collect())
    }

    pub fn catalog_artists(
        &self,
        limit: u32,
        offset: u32,
        genre: Option<String>,
    ) -> Result<Vec<ArtistView>, RockskyError> {
        let out = RT
            .block_on(self.inner.catalog_artists(limit, offset, genre.as_deref()))
            .map_err(err)?;
        Ok(out.into_iter().map(Into::into).collect())
    }

    pub fn catalog_songs(
        &self,
        limit: u32,
        offset: u32,
        genre: Option<String>,
    ) -> Result<Vec<SongView>, RockskyError> {
        let out = RT
            .block_on(self.inner.catalog_songs(limit, offset, genre.as_deref()))
            .map_err(err)?;
        Ok(out.into_iter().map(Into::into).collect())
    }

    pub fn album_tracks(&self, uri: String) -> Result<Vec<SongView>, RockskyError> {
        let out = RT.block_on(self.inner.album_tracks(&uri)).map_err(err)?;
        Ok(out.into_iter().map(Into::into).collect())
    }

    pub fn artist_albums(&self, uri: String) -> Result<Vec<AlbumView>, RockskyError> {
        let out = RT.block_on(self.inner.artist_albums(&uri)).map_err(err)?;
        Ok(out.into_iter().map(Into::into).collect())
    }

    pub fn artist_tracks(
        &self,
        uri: String,
        limit: u32,
        offset: u32,
    ) -> Result<Vec<SongView>, RockskyError> {
        let out = RT
            .block_on(self.inner.artist_tracks(&uri, limit, offset))
            .map_err(err)?;
        Ok(out.into_iter().map(Into::into).collect())
    }

    pub fn scrobble_feed(
        &self,
        did: Option<String>,
        following: bool,
        limit: u32,
        offset: u32,
    ) -> Result<Vec<ScrobbleView>, RockskyError> {
        let out = RT
            .block_on(
                self.inner
                    .scrobble_feed(did.as_deref(), following, limit, offset),
            )
            .map_err(err)?;
        Ok(out.into_iter().map(Into::into).collect())
    }

    pub fn scrobble(&self, uri: String) -> Result<ScrobbleView, RockskyError> {
        Ok(RT.block_on(self.inner.scrobble(&uri)).map_err(err)?.into())
    }

    pub fn follows(
        &self,
        actor: String,
        limit: u32,
        cursor: Option<String>,
    ) -> Result<Vec<ProfileView>, RockskyError> {
        let out = RT
            .block_on(self.inner.follows(&actor, limit, cursor.as_deref()))
            .map_err(err)?;
        Ok(out.into_iter().map(Into::into).collect())
    }

    pub fn followers(
        &self,
        actor: String,
        limit: u32,
        cursor: Option<String>,
    ) -> Result<Vec<ProfileView>, RockskyError> {
        let out = RT
            .block_on(self.inner.followers(&actor, limit, cursor.as_deref()))
            .map_err(err)?;
        Ok(out.into_iter().map(Into::into).collect())
    }

    pub fn known_followers(
        &self,
        actor: String,
        limit: u32,
        cursor: Option<String>,
    ) -> Result<Vec<ProfileView>, RockskyError> {
        let out = RT
            .block_on(self.inner.known_followers(&actor, limit, cursor.as_deref()))
            .map_err(err)?;
        Ok(out.into_iter().map(Into::into).collect())
    }

    pub fn global_stats(&self) -> Result<GlobalStats, RockskyError> {
        Ok(RT.block_on(self.inner.global_stats()).map_err(err)?.into())
    }

    // ---- raw JSON reads --------------------------------------------------
    //
    // The bespoke long tail is returned as a JSON string; host languages parse
    // it into their native map/dict. `get` reaches any read query by nsid.

    /// Call any AppView read query by nsid; returns the raw JSON response.
    pub fn get(
        &self,
        nsid: String,
        params: std::collections::HashMap<String, String>,
    ) -> Result<String, RockskyError> {
        let pairs: Vec<(String, String)> = params.into_iter().collect();
        let v = RT.block_on(self.inner.get(&nsid, &pairs)).map_err(err)?;
        serde_json::to_string(&v).map_err(err)
    }

    pub fn feed(
        &self,
        feed: String,
        limit: u32,
        cursor: Option<String>,
    ) -> Result<String, RockskyError> {
        let v = RT
            .block_on(self.inner.feed(&feed, limit, cursor.as_deref()))
            .map_err(err)?;
        serde_json::to_string(&v).map_err(err)
    }

    pub fn search(&self, query: String) -> Result<String, RockskyError> {
        let v = RT.block_on(self.inner.search(&query)).map_err(err)?;
        serde_json::to_string(&v).map_err(err)
    }

    pub fn album(&self, uri: String) -> Result<String, RockskyError> {
        json(RT.block_on(self.inner.album(&uri)))
    }

    pub fn artist(&self, uri: String) -> Result<String, RockskyError> {
        json(RT.block_on(self.inner.artist(&uri)))
    }

    /// Resolve full canonical metadata for a bare title + artist
    /// (`app.rocksky.song.matchSong`). Returns the detailed song view as JSON.
    pub fn match_song(
        &self,
        title: String,
        artist: String,
        mb_id: Option<String>,
        isrc: Option<String>,
    ) -> Result<String, RockskyError> {
        json(
            RT.block_on(
                self.inner
                    .match_song(&title, &artist, mb_id.as_deref(), isrc.as_deref()),
            ),
        )
    }

    pub fn song(
        &self,
        uri: Option<String>,
        mbid: Option<String>,
        isrc: Option<String>,
        spotify_id: Option<String>,
    ) -> Result<String, RockskyError> {
        json(RT.block_on(self.inner.song(
            uri.as_deref(),
            mbid.as_deref(),
            isrc.as_deref(),
            spotify_id.as_deref(),
        )))
    }

    pub fn actor_playlists(
        &self,
        actor: String,
        limit: u32,
        offset: u32,
    ) -> Result<String, RockskyError> {
        json(RT.block_on(self.inner.actor_playlists(&actor, limit, offset)))
    }

    pub fn neighbours(&self, actor: String) -> Result<String, RockskyError> {
        json(RT.block_on(self.inner.neighbours(&actor)))
    }

    pub fn compatibility(&self, actor: String) -> Result<String, RockskyError> {
        json(RT.block_on(self.inner.compatibility(&actor)))
    }

    pub fn artist_listeners(
        &self,
        uri: String,
        limit: u32,
        offset: u32,
    ) -> Result<String, RockskyError> {
        json(RT.block_on(self.inner.artist_listeners(&uri, limit, offset)))
    }

    pub fn artist_recent_listeners(
        &self,
        uri: String,
        limit: u32,
        offset: u32,
    ) -> Result<String, RockskyError> {
        json(RT.block_on(self.inner.artist_recent_listeners(&uri, limit, offset)))
    }

    pub fn song_recent_listeners(
        &self,
        uri: String,
        limit: u32,
        offset: u32,
    ) -> Result<String, RockskyError> {
        json(RT.block_on(self.inner.song_recent_listeners(&uri, limit, offset)))
    }

    #[allow(clippy::too_many_arguments)]
    pub fn scrobbles_chart(
        &self,
        did: Option<String>,
        artist_uri: Option<String>,
        album_uri: Option<String>,
        song_uri: Option<String>,
        genre: Option<String>,
        from: Option<String>,
        to: Option<String>,
    ) -> Result<String, RockskyError> {
        json(RT.block_on(self.inner.scrobbles_chart(
            did.as_deref(),
            artist_uri.as_deref(),
            album_uri.as_deref(),
            song_uri.as_deref(),
            genre.as_deref(),
            from.as_deref(),
            to.as_deref(),
        )))
    }

    pub fn feed_generators(&self, size: Option<u32>) -> Result<String, RockskyError> {
        json(RT.block_on(self.inner.feed_generators(size)))
    }

    pub fn feed_generator(&self, feed: String) -> Result<String, RockskyError> {
        json(RT.block_on(self.inner.feed_generator(&feed)))
    }

    pub fn stories(
        &self,
        size: Option<u32>,
        feed: Option<String>,
        following: Option<bool>,
    ) -> Result<String, RockskyError> {
        json(RT.block_on(self.inner.stories(size, feed.as_deref(), following)))
    }

    pub fn recommendations(
        &self,
        actor: String,
        limit: Option<u32>,
    ) -> Result<String, RockskyError> {
        json(RT.block_on(self.inner.recommendations(&actor, limit)))
    }

    pub fn artist_recommendations(
        &self,
        actor: String,
        limit: Option<u32>,
    ) -> Result<String, RockskyError> {
        json(RT.block_on(self.inner.artist_recommendations(&actor, limit)))
    }

    pub fn album_recommendations(
        &self,
        actor: String,
        limit: Option<u32>,
    ) -> Result<String, RockskyError> {
        json(RT.block_on(self.inner.album_recommendations(&actor, limit)))
    }

    pub fn stats(&self, actor: String) -> Result<String, RockskyError> {
        json(RT.block_on(self.inner.stats(&actor)))
    }

    pub fn wrapped(&self, actor: String, year: Option<u32>) -> Result<String, RockskyError> {
        json(RT.block_on(self.inner.wrapped(&actor, year)))
    }

    pub fn mirror_sources(&self) -> Result<String, RockskyError> {
        json(RT.block_on(self.inner.mirror_sources()))
    }

    pub fn currently_playing(
        &self,
        player_id: Option<String>,
        actor: Option<String>,
    ) -> Result<String, RockskyError> {
        json(
            RT.block_on(
                self.inner
                    .currently_playing(player_id.as_deref(), actor.as_deref()),
            ),
        )
    }

    pub fn playback_queue(&self, player_id: String) -> Result<String, RockskyError> {
        json(RT.block_on(self.inner.playback_queue(&player_id)))
    }

    pub fn spotify_currently_playing(&self, actor: String) -> Result<String, RockskyError> {
        json(RT.block_on(self.inner.spotify_currently_playing(&actor)))
    }

    pub fn playlists(&self, limit: u32, offset: u32) -> Result<String, RockskyError> {
        json(RT.block_on(self.inner.playlists(limit, offset)))
    }

    pub fn playlist(&self, uri: String) -> Result<String, RockskyError> {
        json(RT.block_on(self.inner.playlist(&uri)))
    }

    pub fn album_shouts(
        &self,
        uri: String,
        limit: u32,
        offset: u32,
    ) -> Result<String, RockskyError> {
        json(RT.block_on(self.inner.album_shouts(&uri, limit, offset)))
    }

    pub fn artist_shouts(
        &self,
        uri: String,
        limit: u32,
        offset: u32,
    ) -> Result<String, RockskyError> {
        json(RT.block_on(self.inner.artist_shouts(&uri, limit, offset)))
    }

    pub fn profile_shouts(
        &self,
        actor: String,
        limit: u32,
        offset: u32,
    ) -> Result<String, RockskyError> {
        json(RT.block_on(self.inner.profile_shouts(&actor, limit, offset)))
    }

    pub fn track_shouts(&self, uri: String) -> Result<String, RockskyError> {
        json(RT.block_on(self.inner.track_shouts(&uri)))
    }

    pub fn shout_replies(
        &self,
        uri: String,
        limit: u32,
        offset: u32,
    ) -> Result<String, RockskyError> {
        json(RT.block_on(self.inner.shout_replies(&uri, limit, offset)))
    }

    pub fn audio_settings(&self, actor: String) -> Result<String, RockskyError> {
        json(RT.block_on(self.inner.audio_settings(&actor)))
    }

    pub fn apikeys(&self, limit: u32, offset: u32) -> Result<String, RockskyError> {
        json(RT.block_on(self.inner.apikeys(limit, offset)))
    }
}

/// Serialize a raw-JSON core read result to a string for the FFI boundary.
fn json(r: rocksky_sdk::Result<serde_json::Value>) -> Result<String, RockskyError> {
    serde_json::to_string(&r.map_err(err)?).map_err(err)
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

    /// Scrobble from just a title + artist (album optional): resolve full
    /// metadata via `matchSong`, then run the normal fan-out.
    pub fn scrobble_match(
        &self,
        input: ScrobbleMatchInput,
    ) -> Result<ScrobbleResult, RockskyError> {
        Ok(RT
            .block_on(self.inner.scrobble_match(&input.into()))
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
    /// Download the caller's repo (CAR) and (re)build the local dedup index,
    /// returning the per-collection counts as JSON. Requires a dedup store
    /// (`dedup_path` at login).
    pub fn sync_repo(&self) -> Result<String, RockskyError> {
        let s = RT.block_on(self.inner.sync_repo()).map_err(err)?;
        Ok(serde_json::json!({
            "artists": s.artists,
            "albums": s.albums,
            "songs": s.songs,
            "scrobbles": s.scrobbles,
            "total": s.total(),
        })
        .to_string())
    }
}

/// Jetstream hydration (the `jetstream` feature). Separate export block so the
/// FFI scaffolding is gated with the impl.
#[cfg(feature = "jetstream")]
#[uniffi::export]
impl Agent {
    /// Keep the local dedup index hydrated from Jetstream in the background and
    /// return immediately. Runs for the life of the process.
    pub fn hydrate_from_jetstream(&self) {
        let agent = self.inner.clone();
        RT.spawn(async move {
            let _ = agent.hydrate_from_jetstream().await;
        });
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
