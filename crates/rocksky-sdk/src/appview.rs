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
        let ago_months = |m: u32| now.checked_sub_months(Months::new(m)).unwrap_or(now);
        match self {
            DateInterval::AllTime => (None, None),
            DateInterval::LastDays(n) => (Some(rfc(ago_days(*n as i64))), Some(rfc(now))),
            DateInterval::LastWeeks(n) => (Some(rfc(ago_days(*n as i64 * 7))), Some(rfc(now))),
            DateInterval::LastMonths(n) => (Some(rfc(ago_months(*n))), Some(rfc(now))),
            DateInterval::LastYears(n) => {
                (Some(rfc(ago_months(n.saturating_mul(12)))), Some(rfc(now)))
            }
            DateInterval::Range { start, end } => (Some(rfc(*start)), Some(rfc(*end))),
        }
    }
}

/// A thin async client over the public Rocksky AppView XRPC.
#[derive(Clone)]
pub struct AppView {
    http: reqwest::Client,
    base: String,
    token: Option<String>,
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
            token: None,
        }
    }

    /// Attach a bearer access token, sent as `Authorization: Bearer <token>` on
    /// every request. Optional — needed only for auth-gated read queries
    /// (e.g. compatibility, mirror sources, wrapped, apikeys).
    pub fn with_token(mut self, token: impl Into<String>) -> Self {
        self.token = Some(token.into());
        self
    }

    /// Set (or clear, with `None`) the bearer access token in place.
    pub fn set_token(&mut self, token: Option<String>) {
        self.token = token;
    }

    /// An authenticated client for the `app.rocksky.library.*` (uploaded-music)
    /// API. Every library method requires auth, so this errors with
    /// [`SdkError::Auth`] unless a token has been attached
    /// ([`AppView::with_token`] / [`AppView::set_token`]).
    pub fn library(&self) -> Result<crate::library::Library> {
        let token = self
            .token
            .clone()
            .filter(|t| !t.trim().is_empty())
            .ok_or_else(|| {
                SdkError::Auth(
                    "app.rocksky.library.* requires an access token; call with_token() first"
                        .into(),
                )
            })?;
        crate::library::Library::new(self.base.clone(), token)
    }

    async fn query<T: DeserializeOwned>(&self, nsid: &str, params: &[(&str, String)]) -> Result<T> {
        let url = format!("{}/xrpc/{}", self.base, nsid);
        let filtered: Vec<(&str, String)> = params
            .iter()
            .filter(|(_, v)| !v.is_empty())
            .cloned()
            .collect();
        let mut req = self.http.get(&url).query(&filtered);
        if let Some(token) = &self.token {
            req = req.bearer_auth(token);
        }
        let res = req.send().await?;
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

    /// POST an `application/json` body to an XRPC procedure and decode the JSON
    /// response. Attaches the bearer token when one is set — most procedures are
    /// auth-gated.
    async fn mutate<T: DeserializeOwned>(&self, nsid: &str, body: serde_json::Value) -> Result<T> {
        let url = format!("{}/xrpc/{}", self.base, nsid);
        let mut req = self.http.post(&url).json(&body);
        if let Some(token) = &self.token {
            req = req.bearer_auth(token);
        }
        let res = req.send().await?;
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

    /// POST to an XRPC procedure whose arguments ride the **query string** rather
    /// than a JSON body — which is how every `app.rocksky.playlist.*` procedure
    /// is defined. Empty-valued params are dropped, matching `query`.
    async fn procedure<T: DeserializeOwned>(
        &self,
        nsid: &str,
        params: &[(&str, String)],
    ) -> Result<T> {
        let url = format!("{}/xrpc/{}", self.base, nsid);
        let filtered: Vec<(&str, String)> = params
            .iter()
            .filter(|(_, v)| !v.is_empty())
            .cloned()
            .collect();
        let mut req = self.http.post(&url).query(&filtered);
        if let Some(token) = &self.token {
            req = req.bearer_auth(token);
        }
        let res = req.send().await?;
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(SdkError::AppView {
                nsid: nsid.to_string(),
                status: status.as_u16(),
                body,
            });
        }
        // Several procedures answer 200 with an empty body.
        if body.trim().is_empty() {
            return serde_json::from_str("null")
                .map_err(|e| SdkError::Other(format!("decode {nsid}: {e}")));
        }
        serde_json::from_str(&body)
            .map_err(|e| SdkError::Other(format!("decode {nsid}: {e}: {body}")))
    }

    /// Escape hatch — call **any** AppView procedure whose arguments ride the
    /// query string, by nsid. The named playlist methods are sugar over this.
    pub async fn post(&self, nsid: &str, params: &[(String, String)]) -> Result<serde_json::Value> {
        let borrowed: Vec<(&str, String)> = params
            .iter()
            .map(|(k, v)| (k.as_str(), v.clone()))
            .collect();
        self.procedure(nsid, &borrowed).await
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
    pub async fn get(&self, nsid: &str, params: &[(String, String)]) -> Result<serde_json::Value> {
        let borrowed: Vec<(&str, String)> = params
            .iter()
            .map(|(k, v)| (k.as_str(), v.clone()))
            .collect();
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

    /// The album catalog (`app.rocksky.album.getAlbums`), optionally filtered by
    /// `genre` and/or an RSQL `filter` expression (build one with
    /// [`Filter`](crate::filter::Filter)).
    pub async fn catalog_albums(
        &self,
        limit: u32,
        offset: u32,
        genre: Option<&str>,
        filter: Option<&str>,
    ) -> Result<Vec<AlbumView>> {
        let out: AlbumsOutput = self
            .query(
                "app.rocksky.album.getAlbums",
                &[
                    ("limit", limit.to_string()),
                    ("offset", offset.to_string()),
                    ("genre", genre.unwrap_or_default().to_string()),
                    ("filter", filter.unwrap_or_default().to_string()),
                ],
            )
            .await?;
        Ok(out.albums)
    }

    /// The artist catalog (`app.rocksky.artist.getArtists`), optionally filtered by
    /// `genre` and/or an RSQL `filter` expression (build one with
    /// [`Filter`](crate::filter::Filter)).
    pub async fn catalog_artists(
        &self,
        limit: u32,
        offset: u32,
        genre: Option<&str>,
        filter: Option<&str>,
    ) -> Result<Vec<ArtistView>> {
        let out: ArtistsOutput = self
            .query(
                "app.rocksky.artist.getArtists",
                &[
                    ("limit", limit.to_string()),
                    ("offset", offset.to_string()),
                    ("genre", genre.unwrap_or_default().to_string()),
                    ("filter", filter.unwrap_or_default().to_string()),
                ],
            )
            .await?;
        Ok(out.artists)
    }

    /// The song catalog (`app.rocksky.song.getSongs`), optionally filtered by
    /// `genre` and/or an RSQL `filter` expression (build one with
    /// [`Filter`](crate::filter::Filter)).
    pub async fn catalog_songs(
        &self,
        limit: u32,
        offset: u32,
        genre: Option<&str>,
        filter: Option<&str>,
    ) -> Result<Vec<SongView>> {
        let out: TracksOutput = self
            .query(
                "app.rocksky.song.getSongs",
                &[
                    ("limit", limit.to_string()),
                    ("offset", offset.to_string()),
                    ("genre", genre.unwrap_or_default().to_string()),
                    ("filter", filter.unwrap_or_default().to_string()),
                ],
            )
            .await?;
        Ok(out.tracks)
    }

    /// An album's tracklist by album at:// URI (`app.rocksky.album.getAlbumTracks`).
    pub async fn album_tracks(&self, uri: &str) -> Result<Vec<SongView>> {
        let out: TracksOutput = self
            .query(
                "app.rocksky.album.getAlbumTracks",
                &[("uri", uri.to_string())],
            )
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
    /// `filter` takes an RSQL expression (build one with
    /// [`Filter`](crate::filter::Filter)).
    pub async fn scrobble_feed(
        &self,
        did: Option<&str>,
        following: bool,
        limit: u32,
        offset: u32,
        filter: Option<&str>,
    ) -> Result<Vec<ScrobbleView>> {
        let out: ScrobblesOutput = self
            .query(
                "app.rocksky.scrobble.getScrobbles",
                &[
                    ("did", did.unwrap_or_default().to_string()),
                    ("following", following.to_string()),
                    ("limit", limit.to_string()),
                    ("offset", offset.to_string()),
                    ("filter", filter.unwrap_or_default().to_string()),
                ],
            )
            .await?;
        Ok(out.scrobbles)
    }

    /// Submit a scrobble through the AppView
    /// (`app.rocksky.scrobble.createScrobble`). Requires an access token
    /// ([`AppView::with_token`]); the AppView resolves/creates the artist,
    /// album and song records for you.
    pub async fn create_scrobble(&self, input: &ScrobbleInput) -> Result<ScrobbleView> {
        let body = serde_json::to_value(input)
            .map_err(|e| SdkError::Other(format!("encode scrobble: {e}")))?;
        self.mutate("app.rocksky.scrobble.createScrobble", body)
            .await
    }

    /// A single scrobble by its at:// URI (`app.rocksky.scrobble.getScrobble`).
    pub async fn scrobble(&self, uri: &str) -> Result<ScrobbleView> {
        self.query(
            "app.rocksky.scrobble.getScrobble",
            &[("uri", uri.to_string())],
        )
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

    /// Match a bare `title` + `artist` against Rocksky's database and external
    /// metadata providers, resolving the best canonical track — full album,
    /// artwork, duration, track/disc number, MBID, ISRC, links
    /// (`app.rocksky.song.matchSong`). Optionally anchor with `mb_id` / `isrc`;
    /// `album` steers the match toward that release (case-insensitive) so a
    /// remaster/live/single edition doesn't shadow the intended album.
    /// This is what [`RockskyAgent::scrobble_match`] uses to enrich a scrobble.
    pub async fn match_song(
        &self,
        title: &str,
        artist: &str,
        album: Option<&str>,
        mb_id: Option<&str>,
        isrc: Option<&str>,
    ) -> Result<serde_json::Value> {
        self.query(
            "app.rocksky.song.matchSong",
            &[
                ("title", title.to_string()),
                ("artist", artist.to_string()),
                ("album", album.unwrap_or_default().to_string()),
                ("mbId", mb_id.unwrap_or_default().to_string()),
                ("isrc", isrc.unwrap_or_default().to_string()),
            ],
        )
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

    /// Create a playlist (`app.rocksky.playlist.createPlaylist`). Auth required.
    /// Returns the new record's `{uri, cid}`; the AppView only lists it once
    /// jetstream has ingested the commit.
    pub async fn create_playlist(
        &self,
        name: &str,
        description: Option<&str>,
        picture_url: Option<&str>,
    ) -> Result<serde_json::Value> {
        self.procedure(
            "app.rocksky.playlist.createPlaylist",
            &[
                ("name", name.to_string()),
                ("description", description.unwrap_or_default().to_string()),
                ("pictureUrl", picture_url.unwrap_or_default().to_string()),
            ],
        )
        .await
    }

    /// Rename or re-describe a playlist (`app.rocksky.playlist.updatePlaylist`).
    /// Owner only. Rewrites the record on its existing rkey, so the AT-URI is
    /// stable.
    pub async fn update_playlist(
        &self,
        uri: &str,
        name: Option<&str>,
        description: Option<&str>,
        picture_url: Option<&str>,
    ) -> Result<serde_json::Value> {
        self.procedure(
            "app.rocksky.playlist.updatePlaylist",
            &[
                ("uri", uri.to_string()),
                ("name", name.unwrap_or_default().to_string()),
                ("description", description.unwrap_or_default().to_string()),
                ("pictureUrl", picture_url.unwrap_or_default().to_string()),
            ],
        )
        .await
    }

    /// Add songs by their `app.rocksky.song` AT-URIs
    /// (`app.rocksky.playlist.addSongs`). Owner only. Returns the AT-URIs of the
    /// created `app.rocksky.playlist.song` entries.
    pub async fn add_songs_to_playlist(
        &self,
        uri: &str,
        songs: &[String],
    ) -> Result<serde_json::Value> {
        let mut params = vec![("uri", uri.to_string())];
        params.extend(songs.iter().map(|s| ("songs", s.clone())));
        self.procedure("app.rocksky.playlist.addSongs", &params)
            .await
    }

    /// Remove a song from a playlist (`app.rocksky.playlist.removeTrack`). An
    /// entry record lives in the repo that published it, so only that repo can
    /// retract it.
    pub async fn remove_playlist_track(
        &self,
        uri: &str,
        song_uri: &str,
    ) -> Result<serde_json::Value> {
        self.procedure(
            "app.rocksky.playlist.removeTrack",
            &[("uri", uri.to_string()), ("songUri", song_uri.to_string())],
        )
        .await
    }

    /// Delete a playlist and the caller's own entries
    /// (`app.rocksky.playlist.removePlaylist`). Owner only.
    pub async fn remove_playlist(&self, uri: &str) -> Result<serde_json::Value> {
        self.procedure(
            "app.rocksky.playlist.removePlaylist",
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

    /// Equalizer presets (`app.rocksky.equalizer.listPresets`). Pass an actor
    /// (handle or DID) for a public read of that user's presets; pass `None`
    /// to list the authenticated viewer's own presets (auth-gated — attach a
    /// token first).
    pub async fn equalizer_presets(&self, actor: Option<&str>) -> Result<Vec<EqualizerPresetView>> {
        let out: EqualizerPresetsOutput = self
            .query(
                "app.rocksky.equalizer.listPresets",
                &[("did", actor.unwrap_or_default().to_string())],
            )
            .await?;
        Ok(out.presets)
    }

    /// Create or update an equalizer preset (`app.rocksky.equalizer.putPreset`,
    /// procedure, auth-gated). The record key is the name slugified, so saving
    /// with an existing name overwrites that preset (preserving its
    /// `createdAt`). Returns the saved preset view.
    pub async fn put_equalizer_preset(
        &self,
        input: &EqualizerPresetInput,
    ) -> Result<EqualizerPresetView> {
        let body = serde_json::to_value(input)
            .map_err(|e| SdkError::Other(format!("encode preset: {e}")))?;
        self.mutate("app.rocksky.equalizer.putPreset", body).await
    }

    /// Delete an equalizer preset by record key
    /// (`app.rocksky.equalizer.deletePreset`, procedure, auth-gated).
    pub async fn delete_equalizer_preset(&self, rkey: &str) -> Result<()> {
        let _: serde_json::Value = self
            .procedure(
                "app.rocksky.equalizer.deletePreset",
                &[("rkey", rkey.to_string())],
            )
            .await?;
        Ok(())
    }

    /// The viewer's API keys (`app.rocksky.apikey.getApikeys`, auth-gated).
    pub async fn apikeys(&self, limit: u32, offset: u32) -> Result<serde_json::Value> {
        self.query(
            "app.rocksky.apikey.getApikeys",
            &[("limit", limit.to_string()), ("offset", offset.to_string())],
        )
        .await
    }

    /// The number of unread notifications for the authenticated viewer
    /// (`app.rocksky.notification.getUnreadCount`, auth-gated).
    pub async fn unread_count(&self) -> Result<UnreadCount> {
        self.query("app.rocksky.notification.getUnreadCount", &[])
            .await
    }

    /// The authenticated viewer's notifications, most recent first
    /// (`app.rocksky.notification.listNotifications`, auth-gated). `limit`
    /// defaults to 30 server-side; `cursor` paginates.
    pub async fn notifications(
        &self,
        limit: Option<u32>,
        cursor: Option<&str>,
    ) -> Result<NotificationList> {
        self.query(
            "app.rocksky.notification.listNotifications",
            &[
                ("limit", limit.map(|l| l.to_string()).unwrap_or_default()),
                ("cursor", cursor.unwrap_or_default().to_string()),
            ],
        )
        .await
    }

    /// Mark notifications as viewed (`app.rocksky.notification.updateSeen`,
    /// procedure, auth-gated). Pass the notification ids to mark, or an empty
    /// slice to mark **all** of the viewer's notifications. Returns the number
    /// remaining unread.
    pub async fn update_seen(&self, ids: &[String]) -> Result<UpdateSeenResult> {
        // An empty `ids` array would mark nothing; omit the field to mark all.
        let body = if ids.is_empty() {
            serde_json::json!({})
        } else {
            serde_json::json!({ "ids": ids })
        };
        self.mutate("app.rocksky.notification.updateSeen", body)
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

/// Input for [`AppView::create_scrobble`]. Only `title`, `artist` and
/// `album_artist` are required; everything else enriches the record.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScrobbleInput {
    pub title: String,
    pub artist: String,
    pub album_artist: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album: Option<String>,
    /// Track length in milliseconds.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album_art: Option<String>,
    /// When the play started, as a unix timestamp in seconds.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub track_number: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub copyright_message: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub genres: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub release_date: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub year: Option<i32>,
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

/// `app.rocksky.notification.defs#notificationActor` — the user who triggered a
/// notification.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationActor {
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
}

/// `app.rocksky.notification.defs#notificationView`.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationView {
    #[serde(default)]
    pub id: String,
    /// One of `like_scrobble`, `follow`, `comment_scrobble`, `comment_profile`,
    /// `reply`, `react_comment`.
    #[serde(default)]
    pub r#type: String,
    /// Whether the notification has been viewed.
    #[serde(default)]
    pub read: bool,
    #[serde(default)]
    pub created_at: String,
    /// The at-uri of the subject the notification relates to.
    #[serde(default)]
    pub subject_uri: Option<String>,
    #[serde(default)]
    pub shout_id: Option<String>,
    #[serde(default)]
    pub shout_content: Option<String>,
    #[serde(default)]
    pub actor: Option<NotificationActor>,
}

/// Result of `app.rocksky.notification.listNotifications`.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationList {
    #[serde(default)]
    pub notifications: Vec<NotificationView>,
    /// The number of unread notifications.
    #[serde(default)]
    pub unread_count: i64,
    /// Cursor to pass to the next call for the following page.
    #[serde(default)]
    pub cursor: Option<String>,
}

/// Result of `app.rocksky.notification.getUnreadCount`.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnreadCount {
    /// The number of unread notifications.
    #[serde(default)]
    pub count: i64,
}

/// Result of `app.rocksky.notification.updateSeen`.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSeenResult {
    /// The number of unread notifications remaining.
    #[serde(default)]
    pub unread_count: i64,
}

/// `app.rocksky.rockbox.defs#equalizerBand`.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EqualizerBandView {
    /// Center frequency in Hz.
    #[serde(default)]
    pub frequency: i64,
    /// Band gain in tenths of dB (e.g. 30 = +3.0 dB).
    #[serde(default)]
    pub gain: i64,
    /// Q factor × 10 (e.g. 7 = Q 0.7).
    #[serde(default)]
    pub q: i64,
}

/// `app.rocksky.equalizer.defs#presetView`.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EqualizerPresetView {
    /// AT URI of the preset record.
    #[serde(default)]
    pub uri: String,
    /// Record key: the preset name slugified (lower case, dashes, no spaces).
    #[serde(default)]
    pub rkey: String,
    /// Display name of the preset.
    #[serde(default)]
    pub name: String,
    /// Pre-amplification cut in tenths of dB (e.g. -60 = -6.0 dB).
    #[serde(default)]
    pub precut: Option<i64>,
    /// Up to 10 EQ bands.
    #[serde(default)]
    pub bands: Vec<EqualizerBandView>,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: Option<String>,
}

/// Input for `app.rocksky.equalizer.putPreset`.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EqualizerPresetInput {
    /// Display name; the record key is this name slugified.
    pub name: String,
    /// Pre-amplification cut in tenths of dB (−240..=0).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub precut: Option<i64>,
    /// Up to 10 EQ bands.
    pub bands: Vec<EqualizerBandView>,
}

// ---- output envelopes ----------------------------------------------------

#[derive(Deserialize)]
struct EqualizerPresetsOutput {
    #[serde(default)]
    presets: Vec<EqualizerPresetView>,
}

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
