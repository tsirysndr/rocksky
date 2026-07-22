//! The read side of the SDK: a thin async client over the public Rocksky AppView
//! XRPC (`app.rocksky.*`). Everything here is unauthenticated JSON-over-HTTP, so
//! [`AppView`] is usable standalone — a discovery bot needs nothing else.
//!
//! The wire types (below) are hand-written to match the AppView's JSON view defs
//! (`apps/api/lexicons/**/defs.json`), not the generated record types.

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};

use crate::error::{Result, SdkError};

/// A typed date range for the charts (`top_*`) queries.
///
/// The AppView filters charts by RFC-3339 `startDate`/`endDate`; this models the
/// common windows so callers never hand-format datetimes. The rolling variants
/// resolve against the current UTC time when the request is made.
///
/// ```
/// use rocksky_sdk::DateInterval;
/// let _ = DateInterval::LastDays(7);      // this past week
/// let _ = DateInterval::LastMonths(1);    // this past month
/// let _ = DateInterval::AllTime;          // no bounds
/// ```
#[derive(Clone, Debug)]
pub enum DateInterval {
    /// No bounds — the all-time chart.
    AllTime,
    /// A rolling window of the last `n` days ending now.
    LastDays(u32),
    /// A rolling window of the last `n` weeks ending now.
    LastWeeks(u32),
    /// A rolling window of the last `n` months ending now.
    LastMonths(u32),
    /// A rolling window of the last `n` years ending now.
    LastYears(u32),
    /// An explicit closed `[start, end]` range.
    Range {
        start: chrono::DateTime<chrono::Utc>,
        end: chrono::DateTime<chrono::Utc>,
    },
}

impl DateInterval {
    /// Resolve to `(startDate, endDate)` RFC-3339 bounds; `None` means unbounded.
    pub fn bounds(&self) -> (Option<String>, Option<String>) {
        use chrono::{Duration, Months, SecondsFormat, Utc};
        let now = Utc::now();
        let rfc = |dt: chrono::DateTime<Utc>| dt.to_rfc3339_opts(SecondsFormat::Secs, true);
        let ago_days = |d: i64| now - Duration::days(d);
        let ago_months = |m: u32| {
            now.checked_sub_months(Months::new(m)).unwrap_or(now)
        };
        match self {
            DateInterval::AllTime => (None, None),
            DateInterval::LastDays(n) => (Some(rfc(ago_days(*n as i64))), Some(rfc(now))),
            DateInterval::LastWeeks(n) => (Some(rfc(ago_days(*n as i64 * 7))), Some(rfc(now))),
            DateInterval::LastMonths(n) => (Some(rfc(ago_months(*n))), Some(rfc(now))),
            DateInterval::LastYears(n) => (Some(rfc(ago_months(n.saturating_mul(12)))), Some(rfc(now))),
            DateInterval::Range { start, end } => (Some(rfc(*start)), Some(rfc(*end))),
        }
    }
}

/// A thin async client over the public Rocksky AppView XRPC.
#[derive(Clone)]
pub struct AppView {
    http: reqwest::Client,
    base: String,
}

impl AppView {
    /// Build a client against an AppView base URL (e.g. `https://api.rocksky.app`).
    pub fn new(base: impl Into<String>) -> Self {
        let http = reqwest::Client::builder()
            .user_agent(concat!("rocksky-sdk/", env!("CARGO_PKG_VERSION")))
            .build()
            .expect("reqwest client");
        Self {
            http,
            base: base.into().trim_end_matches('/').to_string(),
        }
    }

    async fn query<T: DeserializeOwned>(&self, nsid: &str, params: &[(&str, String)]) -> Result<T> {
        let url = format!("{}/xrpc/{}", self.base, nsid);
        let filtered: Vec<(&str, String)> = params
            .iter()
            .filter(|(_, v)| !v.is_empty())
            .cloned()
            .collect();
        let res = self.http.get(&url).query(&filtered).send().await?;
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(SdkError::AppView {
                nsid: nsid.to_string(),
                status: status.as_u16(),
                body,
            });
        }
        serde_json::from_str(&body)
            .map_err(|e| SdkError::Other(format!("decode {nsid}: {e}: {body}")))
    }

    /// Escape hatch — call **any** AppView read query by its nsid and get the raw
    /// JSON response back. Every named method on this client is sugar over this,
    /// so `get` reaches queries that have no dedicated wrapper (and any added
    /// server-side later). Empty-valued params are dropped before the request.
    ///
    /// ```no_run
    /// # async fn f(av: &rocksky_sdk::AppView) -> rocksky_sdk::Result<()> {
    /// let chart = av
    ///     .get("app.rocksky.charts.getScrobblesChart", &[("did".into(), "did:plc:…".into())])
    ///     .await?;
    /// # Ok(()) }
    /// ```
    pub async fn get(
        &self,
        nsid: &str,
        params: &[(String, String)],
    ) -> Result<serde_json::Value> {
        let borrowed: Vec<(&str, String)> =
            params.iter().map(|(k, v)| (k.as_str(), v.clone())).collect();
        self.query(nsid, &borrowed).await
    }

    /// An actor's detailed profile (`app.rocksky.actor.getProfile`). `actor` is a
    /// handle or DID.
    pub async fn profile(&self, actor: &str) -> Result<ProfileView> {
        self.query(
            "app.rocksky.actor.getProfile",
            &[("did", actor.to_string())],
        )
        .await
    }

    /// An actor's scrobbles, newest first (`app.rocksky.actor.getActorScrobbles`).
    pub async fn scrobbles(
        &self,
        actor: &str,
        limit: u32,
        offset: u32,
    ) -> Result<Vec<ScrobbleView>> {
        let out: ScrobblesOutput = self
            .query(
                "app.rocksky.actor.getActorScrobbles",
                &[
                    ("did", actor.to_string()),
                    ("limit", limit.to_string()),
                    ("offset", offset.to_string()),
                ],
            )
            .await?;
        Ok(out.scrobbles)
    }

    /// An actor's most-played songs (`app.rocksky.actor.getActorSongs`).
    pub async fn songs(&self, actor: &str, limit: u32, offset: u32) -> Result<Vec<SongView>> {
        let out: TracksOutput = self
            .query(
                "app.rocksky.actor.getActorSongs",
                &[
                    ("did", actor.to_string()),
                    ("limit", limit.to_string()),
                    ("offset", offset.to_string()),
                ],
            )
            .await?;
        Ok(out.tracks)
    }

    /// An actor's loved (liked) songs (`app.rocksky.actor.getActorLovedSongs`).
    pub async fn loved_songs(&self, actor: &str, limit: u32, offset: u32) -> Result<Vec<SongView>> {
        let out: TracksOutput = self
            .query(
                "app.rocksky.actor.getActorLovedSongs",
                &[
                    ("did", actor.to_string()),
                    ("limit", limit.to_string()),
                    ("offset", offset.to_string()),
                ],
            )
            .await?;
        Ok(out.tracks)
    }

    /// An actor's most-played albums (`app.rocksky.actor.getActorAlbums`).
    pub async fn albums(&self, actor: &str, limit: u32, offset: u32) -> Result<Vec<AlbumView>> {
        let out: AlbumsOutput = self
            .query(
                "app.rocksky.actor.getActorAlbums",
                &[
                    ("did", actor.to_string()),
                    ("limit", limit.to_string()),
                    ("offset", offset.to_string()),
                ],
            )
            .await?;
        Ok(out.albums)
    }

    /// An actor's most-played artists (`app.rocksky.actor.getActorArtists`).
    pub async fn artists(&self, actor: &str, limit: u32, offset: u32) -> Result<Vec<ArtistView>> {
        let out: ArtistsOutput = self
            .query(
                "app.rocksky.actor.getActorArtists",
                &[
                    ("did", actor.to_string()),
                    ("limit", limit.to_string()),
                    ("offset", offset.to_string()),
                ],
            )
            .await?;
        Ok(out.artists)
    }

    /// A feed by its at:// URI (`app.rocksky.feed.getFeed`). Paginated via
    /// `cursor` (pass `None` for the first page).
    pub async fn feed(&self, feed: &str, limit: u32, cursor: Option<&str>) -> Result<FeedView> {
        self.query(
            "app.rocksky.feed.getFeed",
            &[
                ("feed", feed.to_string()),
                ("limit", limit.to_string()),
                ("cursor", cursor.unwrap_or_default().to_string()),
            ],
        )
        .await
    }

    /// Full-text search across songs, albums, artists, playlists and actors
    /// (`app.rocksky.feed.search`). Hits are a heterogeneous union, kept as raw
    /// JSON values.
    pub async fn search(&self, query: &str) -> Result<SearchResults> {
        self.query("app.rocksky.feed.search", &[("query", query.to_string())])
            .await
    }

    /// The platform-wide top artists chart (`app.rocksky.charts.getTopArtists`).
    pub async fn top_artists(&self, limit: u32, offset: u32) -> Result<Vec<ArtistView>> {
        self.top_artists_interval(limit, offset, DateInterval::AllTime)
            .await
    }

    /// The platform-wide top tracks chart (`app.rocksky.charts.getTopTracks`).
    pub async fn top_tracks(&self, limit: u32, offset: u32) -> Result<Vec<SongView>> {
        self.top_tracks_interval(limit, offset, DateInterval::AllTime)
            .await
    }

    /// The top artists chart over a typed [`DateInterval`]
    /// (`app.rocksky.charts.getTopArtists`).
    pub async fn top_artists_interval(
        &self,
        limit: u32,
        offset: u32,
        interval: DateInterval,
    ) -> Result<Vec<ArtistView>> {
        let (start, end) = interval.bounds();
        let out: ArtistsOutput = self
            .query(
                "app.rocksky.charts.getTopArtists",
                &[
                    ("limit", limit.to_string()),
                    ("offset", offset.to_string()),
                    ("startDate", start.unwrap_or_default()),
                    ("endDate", end.unwrap_or_default()),
                ],
            )
            .await?;
        Ok(out.artists)
    }

    /// The top tracks chart over a typed [`DateInterval`]
    /// (`app.rocksky.charts.getTopTracks`).
    pub async fn top_tracks_interval(
        &self,
        limit: u32,
        offset: u32,
        interval: DateInterval,
    ) -> Result<Vec<SongView>> {
        let (start, end) = interval.bounds();
        let out: TracksOutput = self
            .query(
                "app.rocksky.charts.getTopTracks",
                &[
                    ("limit", limit.to_string()),
                    ("offset", offset.to_string()),
                    ("startDate", start.unwrap_or_default()),
                    ("endDate", end.unwrap_or_default()),
                ],
            )
            .await?;
        Ok(out.tracks)
    }

    /// Platform-wide totals (`app.rocksky.stats.getGlobalStats`).
    pub async fn global_stats(&self) -> Result<GlobalStats> {
        self.query("app.rocksky.stats.getGlobalStats", &[]).await
    }

    // ---- catalog (typed) -------------------------------------------------

    /// The album catalog, optionally filtered by `genre` (`app.rocksky.album.getAlbums`).
    pub async fn catalog_albums(
        &self,
        limit: u32,
        offset: u32,
        genre: Option<&str>,
    ) -> Result<Vec<AlbumView>> {
        let out: AlbumsOutput = self
            .query(
                "app.rocksky.album.getAlbums",
                &[
                    ("limit", limit.to_string()),
                    ("offset", offset.to_string()),
                    ("genre", genre.unwrap_or_default().to_string()),
                ],
            )
            .await?;
        Ok(out.albums)
    }

    /// The artist catalog, optionally filtered by `genre` (`app.rocksky.artist.getArtists`).
    pub async fn catalog_artists(
        &self,
        limit: u32,
        offset: u32,
        genre: Option<&str>,
    ) -> Result<Vec<ArtistView>> {
        let out: ArtistsOutput = self
            .query(
                "app.rocksky.artist.getArtists",
                &[
                    ("limit", limit.to_string()),
                    ("offset", offset.to_string()),
                    ("genre", genre.unwrap_or_default().to_string()),
                ],
            )
            .await?;
        Ok(out.artists)
    }

    /// The song catalog, optionally filtered by `genre` (`app.rocksky.song.getSongs`).
    pub async fn catalog_songs(
        &self,
        limit: u32,
        offset: u32,
        genre: Option<&str>,
    ) -> Result<Vec<SongView>> {
        let out: TracksOutput = self
            .query(
                "app.rocksky.song.getSongs",
                &[
                    ("limit", limit.to_string()),
                    ("offset", offset.to_string()),
                    ("genre", genre.unwrap_or_default().to_string()),
                ],
            )
            .await?;
        Ok(out.tracks)
    }

    /// An album's tracklist by album at:// URI (`app.rocksky.album.getAlbumTracks`).
    pub async fn album_tracks(&self, uri: &str) -> Result<Vec<SongView>> {
        let out: TracksOutput = self
            .query("app.rocksky.album.getAlbumTracks", &[("uri", uri.to_string())])
            .await?;
        Ok(out.tracks)
    }

    /// An artist's albums by artist at:// URI (`app.rocksky.artist.getArtistAlbums`).
    pub async fn artist_albums(&self, uri: &str) -> Result<Vec<AlbumView>> {
        let out: AlbumsOutput = self
            .query(
                "app.rocksky.artist.getArtistAlbums",
                &[("uri", uri.to_string())],
            )
            .await?;
        Ok(out.albums)
    }

    /// An artist's top tracks by artist at:// URI (`app.rocksky.artist.getArtistTracks`).
    pub async fn artist_tracks(&self, uri: &str, limit: u32, offset: u32) -> Result<Vec<SongView>> {
        let out: TracksOutput = self
            .query(
                "app.rocksky.artist.getArtistTracks",
                &[
                    ("uri", uri.to_string()),
                    ("limit", limit.to_string()),
                    ("offset", offset.to_string()),
                ],
            )
            .await?;
        Ok(out.tracks)
    }

    /// A social/global scrobbles feed (`app.rocksky.scrobble.getScrobbles`). Pass
    /// `did` to scope to an actor and `following = true` for their follow graph.
    pub async fn scrobble_feed(
        &self,
        did: Option<&str>,
        following: bool,
        limit: u32,
        offset: u32,
    ) -> Result<Vec<ScrobbleView>> {
        let out: ScrobblesOutput = self
            .query(
                "app.rocksky.scrobble.getScrobbles",
                &[
                    ("did", did.unwrap_or_default().to_string()),
                    ("following", following.to_string()),
                    ("limit", limit.to_string()),
                    ("offset", offset.to_string()),
                ],
            )
            .await?;
        Ok(out.scrobbles)
    }

    /// A single scrobble by its at:// URI (`app.rocksky.scrobble.getScrobble`).
    pub async fn scrobble(&self, uri: &str) -> Result<ScrobbleView> {
        self.query("app.rocksky.scrobble.getScrobble", &[("uri", uri.to_string())])
            .await
    }

    // ---- social graph (typed) -------------------------------------------

    /// The accounts `actor` follows (`app.rocksky.graph.getFollows`).
    pub async fn follows(
        &self,
        actor: &str,
        limit: u32,
        cursor: Option<&str>,
    ) -> Result<Vec<ProfileView>> {
        let out: FollowsOutput = self
            .query(
                "app.rocksky.graph.getFollows",
                &[
                    ("actor", actor.to_string()),
                    ("limit", limit.to_string()),
                    ("cursor", cursor.unwrap_or_default().to_string()),
                ],
            )
            .await?;
        Ok(out.follows)
    }

    /// The accounts that follow `actor` (`app.rocksky.graph.getFollowers`).
    pub async fn followers(
        &self,
        actor: &str,
        limit: u32,
        cursor: Option<&str>,
    ) -> Result<Vec<ProfileView>> {
        let out: FollowersOutput = self
            .query(
                "app.rocksky.graph.getFollowers",
                &[
                    ("actor", actor.to_string()),
                    ("limit", limit.to_string()),
                    ("cursor", cursor.unwrap_or_default().to_string()),
                ],
            )
            .await?;
        Ok(out.followers)
    }

    /// Followers of `actor` that the viewer also follows
    /// (`app.rocksky.graph.getKnownFollowers`).
    pub async fn known_followers(
        &self,
        actor: &str,
        limit: u32,
        cursor: Option<&str>,
    ) -> Result<Vec<ProfileView>> {
        let out: FollowersOutput = self
            .query(
                "app.rocksky.graph.getKnownFollowers",
                &[
                    ("actor", actor.to_string()),
                    ("limit", limit.to_string()),
                    ("cursor", cursor.unwrap_or_default().to_string()),
                ],
            )
            .await?;
        Ok(out.followers)
    }

    // ---- detail lookups & the long tail (raw JSON) ----------------------
    //
    // These return the AppView's JSON verbatim (`serde_json::Value`): their
    // shapes are bespoke (nested tracklists, charts, wrapped, now-playing,
    // recommendations, shouts, playlists) and not worth freezing into structs.
    // Reach anything else via [`AppView::get`].

    /// A single album with its tracklist (`app.rocksky.album.getAlbum`).
    pub async fn album(&self, uri: &str) -> Result<serde_json::Value> {
        self.query("app.rocksky.album.getAlbum", &[("uri", uri.to_string())])
            .await
    }

    /// A single artist with detail (`app.rocksky.artist.getArtist`).
    pub async fn artist(&self, uri: &str) -> Result<serde_json::Value> {
        self.query("app.rocksky.artist.getArtist", &[("uri", uri.to_string())])
            .await
    }

    /// A single song with detail (`app.rocksky.song.getSong`). Look up by at://
    /// `uri`, or pass `mbid` / `isrc` / `spotify_id` instead.
    pub async fn song(
        &self,
        uri: Option<&str>,
        mbid: Option<&str>,
        isrc: Option<&str>,
        spotify_id: Option<&str>,
    ) -> Result<serde_json::Value> {
        self.query(
            "app.rocksky.song.getSong",
            &[
                ("uri", uri.unwrap_or_default().to_string()),
                ("mbid", mbid.unwrap_or_default().to_string()),
                ("isrc", isrc.unwrap_or_default().to_string()),
                ("spotifyId", spotify_id.unwrap_or_default().to_string()),
            ],
        )
        .await
    }

    /// An actor's playlists (`app.rocksky.actor.getActorPlaylists`).
    pub async fn actor_playlists(
        &self,
        actor: &str,
        limit: u32,
        offset: u32,
    ) -> Result<serde_json::Value> {
        self.query(
            "app.rocksky.actor.getActorPlaylists",
            &[
                ("did", actor.to_string()),
                ("limit", limit.to_string()),
                ("offset", offset.to_string()),
            ],
        )
        .await
    }

    /// Actors with similar taste to `actor` (`app.rocksky.actor.getActorNeighbours`).
    pub async fn neighbours(&self, actor: &str) -> Result<serde_json::Value> {
        self.query(
            "app.rocksky.actor.getActorNeighbours",
            &[("did", actor.to_string())],
        )
        .await
    }

    /// Music compatibility between the viewer and `actor`
    /// (`app.rocksky.actor.getActorCompatibility`, auth-gated).
    pub async fn compatibility(&self, actor: &str) -> Result<serde_json::Value> {
        self.query(
            "app.rocksky.actor.getActorCompatibility",
            &[("did", actor.to_string())],
        )
        .await
    }

    /// An artist's all-time listeners (`app.rocksky.artist.getArtistListeners`).
    pub async fn artist_listeners(
        &self,
        uri: &str,
        limit: u32,
        offset: u32,
    ) -> Result<serde_json::Value> {
        self.query(
            "app.rocksky.artist.getArtistListeners",
            &[
                ("uri", uri.to_string()),
                ("limit", limit.to_string()),
                ("offset", offset.to_string()),
            ],
        )
        .await
    }

    /// An artist's recent listeners (`app.rocksky.artist.getArtistRecentListeners`).
    pub async fn artist_recent_listeners(
        &self,
        uri: &str,
        limit: u32,
        offset: u32,
    ) -> Result<serde_json::Value> {
        self.query(
            "app.rocksky.artist.getArtistRecentListeners",
            &[
                ("uri", uri.to_string()),
                ("limit", limit.to_string()),
                ("offset", offset.to_string()),
            ],
        )
        .await
    }

    /// A song's recent listeners (`app.rocksky.song.getSongRecentListeners`).
    pub async fn song_recent_listeners(
        &self,
        uri: &str,
        limit: u32,
        offset: u32,
    ) -> Result<serde_json::Value> {
        self.query(
            "app.rocksky.song.getSongRecentListeners",
            &[
                ("uri", uri.to_string()),
                ("limit", limit.to_string()),
                ("offset", offset.to_string()),
            ],
        )
        .await
    }

    /// A scrobble time-series chart (`app.rocksky.charts.getScrobblesChart`). Scope
    /// with any of `did` / `artist_uri` / `album_uri` / `song_uri` / `genre`, and
    /// bound with `from` / `to`.
    #[allow(clippy::too_many_arguments)]
    pub async fn scrobbles_chart(
        &self,
        did: Option<&str>,
        artist_uri: Option<&str>,
        album_uri: Option<&str>,
        song_uri: Option<&str>,
        genre: Option<&str>,
        from: Option<&str>,
        to: Option<&str>,
    ) -> Result<serde_json::Value> {
        self.query(
            "app.rocksky.charts.getScrobblesChart",
            &[
                ("did", did.unwrap_or_default().to_string()),
                ("artisturi", artist_uri.unwrap_or_default().to_string()),
                ("albumuri", album_uri.unwrap_or_default().to_string()),
                ("songuri", song_uri.unwrap_or_default().to_string()),
                ("genre", genre.unwrap_or_default().to_string()),
                ("from", from.unwrap_or_default().to_string()),
                ("to", to.unwrap_or_default().to_string()),
            ],
        )
        .await
    }

    /// List the available feed generators (`app.rocksky.feed.getFeedGenerators`).
    pub async fn feed_generators(&self, size: Option<u32>) -> Result<serde_json::Value> {
        self.query(
            "app.rocksky.feed.getFeedGenerators",
            &[("size", size.map(|s| s.to_string()).unwrap_or_default())],
        )
        .await
    }

    /// A single feed generator's record (`app.rocksky.feed.getFeedGenerator`).
    pub async fn feed_generator(&self, feed: &str) -> Result<serde_json::Value> {
        self.query(
            "app.rocksky.feed.getFeedGenerator",
            &[("feed", feed.to_string())],
        )
        .await
    }

    /// The stories row (`app.rocksky.feed.getStories`).
    pub async fn stories(
        &self,
        size: Option<u32>,
        feed: Option<&str>,
        following: Option<bool>,
    ) -> Result<serde_json::Value> {
        self.query(
            "app.rocksky.feed.getStories",
            &[
                ("size", size.map(|s| s.to_string()).unwrap_or_default()),
                ("feed", feed.unwrap_or_default().to_string()),
                (
                    "following",
                    following.map(|b| b.to_string()).unwrap_or_default(),
                ),
            ],
        )
        .await
    }

    /// Track recommendations for `actor` (`app.rocksky.feed.getRecommendations`).
    pub async fn recommendations(
        &self,
        actor: &str,
        limit: Option<u32>,
    ) -> Result<serde_json::Value> {
        self.query(
            "app.rocksky.feed.getRecommendations",
            &[
                ("did", actor.to_string()),
                ("limit", limit.map(|l| l.to_string()).unwrap_or_default()),
            ],
        )
        .await
    }

    /// Artist recommendations for `actor` (`app.rocksky.feed.getArtistRecommendations`).
    pub async fn artist_recommendations(
        &self,
        actor: &str,
        limit: Option<u32>,
    ) -> Result<serde_json::Value> {
        self.query(
            "app.rocksky.feed.getArtistRecommendations",
            &[
                ("did", actor.to_string()),
                ("limit", limit.map(|l| l.to_string()).unwrap_or_default()),
            ],
        )
        .await
    }

    /// Album recommendations for `actor` (`app.rocksky.feed.getAlbumRecommendations`).
    pub async fn album_recommendations(
        &self,
        actor: &str,
        limit: Option<u32>,
    ) -> Result<serde_json::Value> {
        self.query(
            "app.rocksky.feed.getAlbumRecommendations",
            &[
                ("did", actor.to_string()),
                ("limit", limit.map(|l| l.to_string()).unwrap_or_default()),
            ],
        )
        .await
    }

    /// An actor's aggregate stats (`app.rocksky.stats.getStats`).
    pub async fn stats(&self, actor: &str) -> Result<serde_json::Value> {
        self.query("app.rocksky.stats.getStats", &[("did", actor.to_string())])
            .await
    }

    /// An actor's year-in-review (`app.rocksky.stats.getWrapped`).
    pub async fn wrapped(&self, actor: &str, year: Option<u32>) -> Result<serde_json::Value> {
        self.query(
            "app.rocksky.stats.getWrapped",
            &[
                ("did", actor.to_string()),
                ("year", year.map(|y| y.to_string()).unwrap_or_default()),
            ],
        )
        .await
    }

    /// The viewer's configured scrobble mirror sources
    /// (`app.rocksky.mirror.getMirrorSources`, auth-gated).
    pub async fn mirror_sources(&self) -> Result<serde_json::Value> {
        self.query("app.rocksky.mirror.getMirrorSources", &[]).await
    }

    /// What `actor` is playing now (`app.rocksky.player.getCurrentlyPlaying`).
    pub async fn currently_playing(
        &self,
        player_id: Option<&str>,
        actor: Option<&str>,
    ) -> Result<serde_json::Value> {
        self.query(
            "app.rocksky.player.getCurrentlyPlaying",
            &[
                ("playerId", player_id.unwrap_or_default().to_string()),
                ("actor", actor.unwrap_or_default().to_string()),
            ],
        )
        .await
    }

    /// A player's playback queue (`app.rocksky.player.getPlaybackQueue`).
    pub async fn playback_queue(&self, player_id: &str) -> Result<serde_json::Value> {
        self.query(
            "app.rocksky.player.getPlaybackQueue",
            &[("playerId", player_id.to_string())],
        )
        .await
    }

    /// What `actor` is playing now on Spotify (`app.rocksky.spotify.getCurrentlyPlaying`).
    pub async fn spotify_currently_playing(&self, actor: &str) -> Result<serde_json::Value> {
        self.query(
            "app.rocksky.spotify.getCurrentlyPlaying",
            &[("actor", actor.to_string())],
        )
        .await
    }

    /// The playlist catalog (`app.rocksky.playlist.getPlaylists`).
    pub async fn playlists(&self, limit: u32, offset: u32) -> Result<serde_json::Value> {
        self.query(
            "app.rocksky.playlist.getPlaylists",
            &[("limit", limit.to_string()), ("offset", offset.to_string())],
        )
        .await
    }

    /// A single playlist with its items (`app.rocksky.playlist.getPlaylist`).
    pub async fn playlist(&self, uri: &str) -> Result<serde_json::Value> {
        self.query(
            "app.rocksky.playlist.getPlaylist",
            &[("uri", uri.to_string())],
        )
        .await
    }

    /// Shouts on an album (`app.rocksky.shout.getAlbumShouts`).
    pub async fn album_shouts(
        &self,
        uri: &str,
        limit: u32,
        offset: u32,
    ) -> Result<serde_json::Value> {
        self.query(
            "app.rocksky.shout.getAlbumShouts",
            &[
                ("uri", uri.to_string()),
                ("limit", limit.to_string()),
                ("offset", offset.to_string()),
            ],
        )
        .await
    }

    /// Shouts on an artist (`app.rocksky.shout.getArtistShouts`).
    pub async fn artist_shouts(
        &self,
        uri: &str,
        limit: u32,
        offset: u32,
    ) -> Result<serde_json::Value> {
        self.query(
            "app.rocksky.shout.getArtistShouts",
            &[
                ("uri", uri.to_string()),
                ("limit", limit.to_string()),
                ("offset", offset.to_string()),
            ],
        )
        .await
    }

    /// Shouts on a profile (`app.rocksky.shout.getProfileShouts`).
    pub async fn profile_shouts(
        &self,
        actor: &str,
        limit: u32,
        offset: u32,
    ) -> Result<serde_json::Value> {
        self.query(
            "app.rocksky.shout.getProfileShouts",
            &[
                ("did", actor.to_string()),
                ("limit", limit.to_string()),
                ("offset", offset.to_string()),
            ],
        )
        .await
    }

    /// Shouts on a track (`app.rocksky.shout.getTrackShouts`).
    pub async fn track_shouts(&self, uri: &str) -> Result<serde_json::Value> {
        self.query(
            "app.rocksky.shout.getTrackShouts",
            &[("uri", uri.to_string())],
        )
        .await
    }

    /// Replies to a shout (`app.rocksky.shout.getShoutReplies`).
    pub async fn shout_replies(
        &self,
        uri: &str,
        limit: u32,
        offset: u32,
    ) -> Result<serde_json::Value> {
        self.query(
            "app.rocksky.shout.getShoutReplies",
            &[
                ("uri", uri.to_string()),
                ("limit", limit.to_string()),
                ("offset", offset.to_string()),
            ],
        )
        .await
    }

    /// An actor's Rockbox EQ / audio settings (`app.rocksky.rockbox.getAudioSettings`).
    pub async fn audio_settings(&self, actor: &str) -> Result<serde_json::Value> {
        self.query(
            "app.rocksky.rockbox.getAudioSettings",
            &[("did", actor.to_string())],
        )
        .await
    }

    /// The viewer's API keys (`app.rocksky.apikey.getApikeys`, auth-gated).
    pub async fn apikeys(&self, limit: u32, offset: u32) -> Result<serde_json::Value> {
        self.query(
            "app.rocksky.apikey.getApikeys",
            &[("limit", limit.to_string()), ("offset", offset.to_string())],
        )
        .await
    }
}

// ---- wire types ----------------------------------------------------------

/// `app.rocksky.actor.defs#profileViewDetailed`.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileView {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub did: Option<String>,
    #[serde(default)]
    pub handle: Option<String>,
    #[serde(default)]
    pub display_name: Option<String>,
    #[serde(default)]
    pub avatar: Option<String>,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
}

/// A scrobble as returned by the AppView (`app.rocksky.scrobble.defs#scrobbleViewBasic`).
///
/// Matches the lexicon def field-for-field (the def was aligned to production:
/// the actor is `handle`/`avatar`/`did`, the album cover `album_art`, the
/// timestamp `created_at`). Every field is optional so both basic and social
/// responses decode; mirrors the generated `app_rocksky::scrobble::ScrobbleViewBasic`.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScrobbleView {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub track_id: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub artist: Option<String>,
    #[serde(default)]
    pub album_artist: Option<String>,
    #[serde(default)]
    pub album: Option<String>,
    #[serde(default)]
    pub album_art: Option<String>,
    /// The scrobbling actor's handle.
    #[serde(default)]
    pub handle: Option<String>,
    #[serde(default)]
    pub did: Option<String>,
    /// The scrobbling actor's avatar URL.
    #[serde(default)]
    pub avatar: Option<String>,
    #[serde(default)]
    pub uri: Option<String>,
    #[serde(default)]
    pub track_uri: Option<String>,
    #[serde(default)]
    pub artist_uri: Option<String>,
    #[serde(default)]
    pub album_uri: Option<String>,
    #[serde(default)]
    pub created_at: Option<String>,
    // Fields that appear on detailed / social responses.
    #[serde(default)]
    pub sha256: Option<String>,
    #[serde(default)]
    pub liked: Option<bool>,
    #[serde(default)]
    pub likes_count: Option<u32>,
}

/// `app.rocksky.song.defs#songViewBasic`.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SongView {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub artist: Option<String>,
    #[serde(default)]
    pub album_artist: Option<String>,
    #[serde(default)]
    pub album_art: Option<String>,
    #[serde(default)]
    pub uri: Option<String>,
    #[serde(default)]
    pub album: Option<String>,
    #[serde(default)]
    pub duration: Option<u64>,
    #[serde(default)]
    pub track_number: Option<u32>,
    #[serde(default)]
    pub disc_number: Option<u32>,
    #[serde(default)]
    pub play_count: Option<u64>,
    #[serde(default)]
    pub unique_listeners: Option<u64>,
    #[serde(default)]
    pub album_uri: Option<String>,
    #[serde(default)]
    pub artist_uri: Option<String>,
    #[serde(default)]
    pub sha256: Option<String>,
    #[serde(default)]
    pub mbid: Option<String>,
    #[serde(default)]
    pub isrc: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub created_at: Option<String>,
}

/// `app.rocksky.album.defs#albumViewBasic`.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumView {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub uri: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub artist: Option<String>,
    #[serde(default)]
    pub artist_uri: Option<String>,
    #[serde(default)]
    pub year: Option<u32>,
    #[serde(default)]
    pub album_art: Option<String>,
    #[serde(default)]
    pub release_date: Option<String>,
    #[serde(default)]
    pub sha256: Option<String>,
    #[serde(default)]
    pub play_count: Option<u64>,
    #[serde(default)]
    pub unique_listeners: Option<u64>,
}

/// `app.rocksky.artist.defs#artistViewBasic`.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtistView {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub uri: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub picture: Option<String>,
    #[serde(default)]
    pub sha256: Option<String>,
    #[serde(default)]
    pub play_count: Option<u64>,
    #[serde(default)]
    pub unique_listeners: Option<u64>,
    #[serde(default)]
    pub tags: Vec<String>,
    /// The AppView returns artist tags under `genres`; kept distinct from `tags`.
    #[serde(default)]
    pub genres: Vec<String>,
}

/// `app.rocksky.feed.defs#feedView`.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedView {
    #[serde(default)]
    pub feed: Vec<FeedItem>,
    #[serde(default)]
    pub cursor: Option<String>,
}

/// `app.rocksky.feed.defs#feedItemView`.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedItem {
    #[serde(default)]
    pub scrobble: Option<ScrobbleView>,
}

/// `app.rocksky.feed.defs#searchResultsView`. Hits are a union of song / album /
/// artist / playlist / actor views, kept as raw JSON.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResults {
    #[serde(default)]
    pub hits: Vec<serde_json::Value>,
    #[serde(default)]
    pub processing_time_ms: Option<u64>,
    #[serde(default)]
    pub limit: Option<u32>,
    #[serde(default)]
    pub offset: Option<u32>,
    #[serde(default)]
    pub estimated_total_hits: Option<u64>,
}

/// `app.rocksky.stats.defs#globalStatsView`.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalStats {
    #[serde(default)]
    pub scrobbles: u64,
    #[serde(default)]
    pub users: u64,
    #[serde(default)]
    pub artists: u64,
    #[serde(default)]
    pub albums: u64,
    #[serde(default)]
    pub tracks: u64,
}

// ---- output envelopes ----------------------------------------------------

#[derive(Deserialize)]
struct ScrobblesOutput {
    #[serde(default)]
    scrobbles: Vec<ScrobbleView>,
}

#[derive(Deserialize)]
struct AlbumsOutput {
    #[serde(default)]
    albums: Vec<AlbumView>,
}

#[derive(Deserialize)]
struct ArtistsOutput {
    #[serde(default)]
    artists: Vec<ArtistView>,
}

#[derive(Deserialize)]
struct TracksOutput {
    #[serde(default)]
    tracks: Vec<SongView>,
}

#[derive(Deserialize)]
struct FollowsOutput {
    #[serde(default)]
    follows: Vec<ProfileView>,
}

#[derive(Deserialize)]
struct FollowersOutput {
    #[serde(default)]
    followers: Vec<ProfileView>,
}
