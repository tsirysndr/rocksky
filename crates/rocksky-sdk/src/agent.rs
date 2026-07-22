//! [`RockskyAgent`] — the SDK's centerpiece, mirroring `@atproto/api`'s `Agent`.
//!
//! It wraps a jacquard credential/OAuth session plus a handle resolver, hides the
//! app-password-vs-OAuth branching behind a single write path, and exposes both
//! high-level convenience verbs and (via [`crate::namespaces`]) a typed escape
//! hatch. Reads go through the bundled [`AppView`].

use std::path::PathBuf;
use std::sync::Arc;

use jacquard::client::credential_session::{
    CredentialLoginOptions, CredentialResumeResult, CredentialSession,
};
use jacquard::client::{Agent, AgentSessionExt, FileAuthStore};
use jacquard::common::session::SessionHint;
use jacquard::identity::JacquardResolver;
use jacquard::types::string::{AtUri, Cid, Datetime, Did, Nsid, UriValue};
use jacquard_common::types::ident::AtIdentifier;
use jacquard_common::types::recordkey::{RecordKey, Rkey};
use jacquard_common::xrpc::XrpcClient;

use crate::app_rocksky::actor::status::Status as ActorStatus;
use crate::app_rocksky::actor::TrackView;
use crate::app_rocksky::album::Album;
use crate::app_rocksky::artist::Artist;
use crate::app_rocksky::graph::follow::Follow;
use crate::app_rocksky::like::Like;
use crate::app_rocksky::scrobble::Scrobble;
use crate::app_rocksky::shout::Shout;
use crate::app_rocksky::song::Song;
use crate::appview::AppView;
use crate::auth::{fetch_profile, rocksky_scopes, Profile};
use crate::com_atproto::repo::strong_ref::StrongRef;
use crate::error::{auth_err, Result, SdkError};

/// The handle resolver backing the agent.
type Resolver = JacquardResolver<reqwest::Client>;

/// User input for a scrobble (`app.rocksky.scrobble`). Only the first five fields
/// are required by the lexicon; the rest enrich the record when known.
#[derive(Clone, Debug, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ScrobbleDraft {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_artist: String,
    /// Track duration in milliseconds.
    pub duration_ms: i64,
    pub album_art_url: Option<String>,
    pub track_number: Option<i64>,
    pub disc_number: Option<i64>,
    pub year: Option<i64>,
    /// RFC 3339 datetime.
    pub release_date: Option<String>,
    pub genre: Option<String>,
    pub tags: Vec<String>,
    pub composer: Option<String>,
    pub label: Option<String>,
    pub mbid: Option<String>,
    pub isrc: Option<String>,
    pub spotify_link: Option<String>,
    pub youtube_link: Option<String>,
    pub tidal_link: Option<String>,
    pub apple_music_link: Option<String>,
    /// Play time as Unix seconds. Defaults to now. Also the dedup timestamp —
    /// two scrobbles of the same track at the same second are treated as one.
    pub timestamp: Option<i64>,
}

/// User input for a canonical track record (`app.rocksky.song`).
#[derive(Clone, Debug, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SongDraft {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_artist: String,
    pub duration_ms: i64,
    pub album_art_url: Option<String>,
    pub track_number: Option<i64>,
    pub disc_number: Option<i64>,
    pub year: Option<i64>,
    pub release_date: Option<String>,
    pub genre: Option<String>,
    pub tags: Vec<String>,
    pub composer: Option<String>,
    pub label: Option<String>,
    pub mbid: Option<String>,
    pub isrc: Option<String>,
    pub spotify_link: Option<String>,
}

/// User input for an album record (`app.rocksky.album`). `artist` is the album
/// artist.
#[derive(Clone, Debug, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AlbumDraft {
    pub title: String,
    pub artist: String,
    pub year: Option<i64>,
    pub release_date: Option<String>,
    pub album_art_url: Option<String>,
    pub genre: Option<String>,
    pub tags: Vec<String>,
    pub spotify_link: Option<String>,
}

/// User input for an artist record (`app.rocksky.artist`).
#[derive(Clone, Debug, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ArtistDraft {
    pub name: String,
    pub tags: Vec<String>,
    pub picture_url: Option<String>,
    pub bio: Option<String>,
}

/// The four records a [`scrobble`](RockskyAgent::scrobble) touches. Each URI is
/// either newly created or, when the record already existed (dedup), the
/// pre-existing one.
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScrobbleResult {
    pub artist_uri: String,
    pub album_uri: String,
    pub song_uri: String,
    pub scrobble_uri: String,
}

/// The track for the actor's now-playing status (`app.rocksky.actor.status`).
#[derive(Clone, Debug, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct NowPlaying {
    pub name: String,
    pub artist: String,
    pub album: Option<String>,
    pub album_cover_url: Option<String>,
    pub duration_ms: Option<i64>,
    /// e.g. `"spotify"` or `"listenbrainz"`.
    pub source: Option<String>,
    pub recording_mb_id: Option<String>,
    /// When the status should expire. Defaults to `started_at + duration + idle`.
    pub expires_at: Option<Datetime>,
}

/// The Rocksky agent: owns credential material, a handle resolver, and a
/// read-only [`AppView`] client bound to the same platform.
#[derive(Clone)]
pub struct RockskyAgent {
    store: Arc<FileAuthStore>,
    resolver: Arc<Resolver>,
    session_path: PathBuf,
    /// Serializes authenticated operations. atproto rotates the refresh token on
    /// every refresh, so two operations refreshing at once would reuse the same
    /// token — which PDSs treat as a compromise and revoke the whole session.
    /// Holding this lock across each op keeps refreshes strictly ordered so
    /// every op sees the latest persisted token.
    auth_lock: Arc<tokio::sync::Mutex<()>>,
    appview: AppView,
    /// Optional local duplicate-prevention index (see [`crate::dedup`]).
    #[cfg(feature = "dedup")]
    dedup: Option<Arc<crate::dedup::RepoIndex>>,
}

/// Builder for [`RockskyAgent`]. Obtain via [`RockskyAgent::builder`].
pub struct RockskyAgentBuilder {
    session_path: Option<PathBuf>,
    appview: String,
    #[cfg(feature = "dedup")]
    dedup_path: Option<PathBuf>,
}

impl Default for RockskyAgentBuilder {
    fn default() -> Self {
        Self {
            session_path: None,
            appview: crate::DEFAULT_APPVIEW.to_string(),
            #[cfg(feature = "dedup")]
            dedup_path: None,
        }
    }
}

impl RockskyAgentBuilder {
    /// Path to the on-disk session file (jacquard `FileAuthStore`). Required.
    pub fn session_store(mut self, path: impl Into<PathBuf>) -> Self {
        self.session_path = Some(path.into());
        self
    }

    /// Override the AppView base URL (defaults to [`crate::DEFAULT_APPVIEW`]).
    pub fn appview(mut self, base: impl Into<String>) -> Self {
        self.appview = base.into();
        self
    }

    /// Path to the on-disk RocksDB duplicate-prevention index. When set, the
    /// write verbs check it before creating a scrobble / song / album / artist,
    /// and [`RockskyAgent::sync_repo`] (re)builds it from the user's repo.
    #[cfg(feature = "dedup")]
    pub fn dedup_store(mut self, path: impl Into<PathBuf>) -> Self {
        self.dedup_path = Some(path.into());
        self
    }

    /// Finish building. Errors if no session store was configured (or if the
    /// dedup store, when configured, can't be opened).
    pub fn build(self) -> Result<RockskyAgent> {
        let session_path = self
            .session_path
            .ok_or_else(|| SdkError::Other("session_store path is required".into()))?;
        #[allow(unused_mut)]
        let mut agent = RockskyAgent::with_parts(session_path, self.appview);
        #[cfg(feature = "dedup")]
        if let Some(path) = self.dedup_path {
            agent.dedup = Some(Arc::new(crate::dedup::RepoIndex::open(path)?));
        }
        Ok(agent)
    }
}

impl RockskyAgent {
    /// Start building an agent.
    pub fn builder() -> RockskyAgentBuilder {
        RockskyAgentBuilder::default()
    }

    /// Construct an agent against a session file, using the default AppView.
    pub fn new(session_path: impl Into<PathBuf>) -> Self {
        Self::with_parts(session_path.into(), crate::DEFAULT_APPVIEW.to_string())
    }

    /// Resume an agent from a persisted session file. Does no network I/O —
    /// the underlying session is resumed lazily on the first authenticated op.
    pub async fn resume(session_path: impl Into<PathBuf>) -> Result<Self> {
        Ok(Self::new(session_path))
    }

    fn with_parts(session_path: PathBuf, appview: String) -> Self {
        let store = Arc::new(FileAuthStore::new(
            session_path.to_string_lossy().to_string(),
        ));
        let resolver = Arc::new(JacquardResolver::new(
            reqwest::Client::new(),
            Default::default(),
        ));
        Self {
            store,
            resolver,
            session_path,
            auth_lock: Arc::new(tokio::sync::Mutex::new(())),
            appview: AppView::new(appview),
            #[cfg(feature = "dedup")]
            dedup: None,
        }
    }

    // ---- identity --------------------------------------------------------

    /// The bundled read-only AppView client.
    pub fn appview(&self) -> &AppView {
        &self.appview
    }

    /// The locally-cached identity, if logged in.
    pub fn profile(&self) -> Option<Profile> {
        Profile::load(&self.session_path)
    }

    /// The `actor` to use for personalized AppView reads (handle or DID).
    pub fn actor(&self) -> Option<String> {
        self.profile().map(|p| p.handle)
    }

    /// The caller's DID, or [`SdkError::NotAuthenticated`] if not logged in.
    #[cfg_attr(not(feature = "dedup"), allow(dead_code))]
    fn did(&self) -> Result<String> {
        self.profile()
            .map(|p| p.did)
            .ok_or(SdkError::NotAuthenticated)
    }

    pub fn is_logged_in(&self) -> bool {
        self.profile().is_some()
    }

    /// True when the stored session was created via the browser OAuth flow.
    pub fn is_oauth_session(&self) -> bool {
        self.profile().map(|p| p.is_oauth()).unwrap_or(false)
    }

    /// Log out: drop the cached session + profile.
    pub fn logout(&self) {
        Profile::clear(&self.session_path);
        let _ = std::fs::remove_file(&self.session_path);
    }

    fn is_oauth(&self) -> bool {
        self.is_oauth_session()
    }

    // ---- auth ------------------------------------------------------------

    /// Log in with an app password. Persists the session + profile.
    pub async fn login_password(&self, identifier: &str, password: &str) -> Result<Profile> {
        let session = CredentialSession::new(self.store.clone(), self.resolver.clone());
        let hint = SessionHint::from_optional_input(Some(identifier));

        let auth = match session.resume(&hint).await.map_err(auth_err)? {
            CredentialResumeResult::Resumed(auth) => auth,
            CredentialResumeResult::LoginRequired(challenge) => session
                .login_from_challenge(
                    challenge,
                    CredentialLoginOptions {
                        password: password.to_string().into(),
                        identifier: Some(identifier.to_string().into()),
                        allow_takendown: None,
                        auth_factor_token: None,
                        pds: None,
                    },
                )
                .await
                .map_err(auth_err)?,
        };

        let did = auth.did.to_string();
        let (_, display_name) = fetch_profile(&did).await.unwrap_or((None, None));
        let profile = Profile {
            display_name,
            did,
            handle: auth.handle.to_string(),
            pds: auth.pds.as_ref().map(|u| u.to_string()),
            method: "password".into(),
        };
        profile.save(&self.session_path)?;
        Ok(profile)
    }

    /// Log in via OAuth, opening the browser to the user's PDS (loopback flow).
    /// Persists the session + profile.
    pub async fn login_oauth(&self, input: Option<&str>) -> Result<Profile> {
        use jacquard::oauth::atproto::AtprotoClientMetadata;
        use jacquard::oauth::client::OAuthClient;
        use jacquard::oauth::loopback::LoopbackConfig;
        use jacquard::oauth::types::AuthorizeOptions;

        let client_data = jacquard::oauth::session::ClientData {
            keyset: None,
            config: AtprotoClientMetadata::default_localhost(),
        };
        let store = FileAuthStore::new(self.session_path.to_string_lossy().to_string());
        let oauth = OAuthClient::new(store, client_data, reqwest::Client::new());
        let hint = SessionHint::from_optional_input(input);
        let scopes = rocksky_scopes()?;

        let session = match oauth
            .resume_or_login_with_local_server(
                &hint,
                AuthorizeOptions::default().with_scopes(scopes.clone()),
                LoopbackConfig::default(),
            )
            .await
            .map_err(auth_err)?
        {
            Some(session) => session,
            None => {
                let who = input.ok_or_else(|| {
                    SdkError::Other("pass a handle, DID, or PDS URL to start OAuth login".into())
                })?;
                oauth
                    .login_with_local_server(
                        who.to_string(),
                        AuthorizeOptions::default().with_scopes(scopes),
                        LoopbackConfig::default(),
                    )
                    .await
                    .map_err(auth_err)?
            }
        };

        let agent: Agent<_> = Agent::from(session);
        // `info().1` is the OAuth *session id*, not the handle — resolve the real
        // handle (and display name) from the DID via the public API.
        let (did, _session_id) = agent
            .info()
            .await
            .ok_or_else(|| SdkError::Other("OAuth session missing identity".into()))?;
        let did = did.to_string();
        let (handle, display_name) = fetch_profile(&did).await.unwrap_or((None, None));
        let profile = Profile {
            display_name,
            handle: handle.unwrap_or_else(|| did.clone()),
            did,
            pds: None,
            method: "oauth".into(),
        };
        profile.save(&self.session_path)?;
        Ok(profile)
    }

    /// Resume the app-password session into an agent.
    async fn credential_agent(&self) -> Result<Agent<CredentialSession<FileAuthStore, Resolver>>> {
        let session = CredentialSession::new(self.store.clone(), self.resolver.clone());
        let actor = self.actor();
        let hint = SessionHint::from_optional_input(actor.as_deref());
        match session.resume(&hint).await.map_err(auth_err)? {
            CredentialResumeResult::Resumed(_) => Ok(Agent::from(session)),
            CredentialResumeResult::LoginRequired(_) => Err(SdkError::NotAuthenticated),
        }
    }

    /// Resume a stored OAuth session (no browser). Errors if it can't be resumed
    /// (expired) so the caller can prompt a fresh sign-in.
    async fn resume_oauth(
        &self,
    ) -> Result<jacquard::oauth::client::OAuthSession<Resolver, FileAuthStore>> {
        use jacquard::oauth::atproto::AtprotoClientMetadata;
        use jacquard::oauth::client::{OAuthClient, OAuthResumeOrLogin};
        use jacquard::oauth::types::AuthorizeOptions;

        let client_data = jacquard::oauth::session::ClientData {
            keyset: None,
            config: AtprotoClientMetadata::default_localhost(),
        };
        let store = FileAuthStore::new(self.session_path.to_string_lossy().to_string());
        let oauth = OAuthClient::new(store, client_data, reqwest::Client::new());
        let actor = self.actor();
        let hint = SessionHint::from_optional_input(actor.as_deref());
        let opts = AuthorizeOptions::default().with_scopes(rocksky_scopes()?);
        match oauth
            .resume_or_start_auth(&hint, opts)
            .await
            .map_err(auth_err)?
        {
            OAuthResumeOrLogin::Resumed(session) => Ok(session),
            _ => Err(SdkError::SessionExpired),
        }
    }

    /// Mint an atproto **service-auth JWT** bound to `aud` (a service DID) and
    /// `lxm` (the lexicon method). Useful for authenticating side channels such
    /// as the Rocksky Connect WebSocket.
    pub async fn mint_service_auth(&self, aud: &str, lxm: &str) -> Result<String> {
        let _guard = self.auth_lock.lock().await;
        use jacquard::api::com_atproto::server::get_service_auth::GetServiceAuth;
        use smol_str::SmolStr;

        let nsid = Nsid::<SmolStr>::new_owned(lxm).map_err(auth_err)?;
        let exp = chrono::Utc::now().timestamp() + 60;
        let req = GetServiceAuth::<SmolStr> {
            aud: SmolStr::new(aud),
            exp: Some(exp),
            lxm: Some(nsid),
        };

        let resp = if self.is_oauth() {
            let agent = Agent::from(self.resume_oauth().await?);
            XrpcClient::send(&agent, req)
                .await
                .map_err(|e| SdkError::Auth(format!("service auth request failed: {e:?}")))?
        } else {
            let agent = self.credential_agent().await?;
            XrpcClient::send(&agent, req)
                .await
                .map_err(|e| SdkError::Auth(format!("service auth request failed: {e:?}")))?
        };
        let out = resp
            .parse::<SmolStr>()
            .map_err(|e| SdkError::Auth(format!("service auth decode: {e:?}")))?;
        Ok(out.token.to_string())
    }

    /// Proactively refresh the stored session so it stays valid without a
    /// re-login. Works for both app-password and OAuth. Held behind
    /// [`Self::auth_lock`] so the rotation can't race another op (a double-spent
    /// refresh token gets the whole session revoked).
    ///
    /// Returns:
    /// - [`SdkError::NotAuthenticated`] if no session is stored (nothing to do),
    /// - [`SdkError::SessionExpired`] if the refresh token itself is dead — the
    ///   only case that genuinely needs the user to run `login` again.
    pub async fn refresh_session(&self) -> Result<()> {
        if !self.is_logged_in() {
            return Err(SdkError::NotAuthenticated);
        }
        let _guard = self.auth_lock.lock().await;
        if self.is_oauth() {
            let session = self.resume_oauth().await?;
            session.refresh().await.map_err(auth_err)?;
        } else {
            let session = CredentialSession::new(self.store.clone(), self.resolver.clone());
            let actor = self.actor();
            let hint = SessionHint::from_optional_input(actor.as_deref());
            match session.resume(&hint).await.map_err(auth_err)? {
                CredentialResumeResult::Resumed(_) => {
                    session.refresh().await.map_err(auth_err)?;
                }
                CredentialResumeResult::LoginRequired(_) => return Err(SdkError::SessionExpired),
            }
        }
        Ok(())
    }
}

/// Low-level record writes. Both app-password (`CredentialSession`) and OAuth
/// (`OAuthSession`) implement `AgentSession`, so these work on either — we branch
/// on the persisted method and resume the right one, holding [`Self::auth_lock`]
/// across each op so refresh-token rotations stay strictly ordered.
impl RockskyAgent {
    /// Create a record on the user's PDS, resuming whichever session exists.
    /// Returns the new record's `at://` URI.
    async fn create<R>(&self, record: R, what: &'static str) -> Result<String>
    where
        R: jacquard_common::types::collection::Collection + serde::Serialize,
    {
        let _guard = self.auth_lock.lock().await;
        let out = if self.is_oauth() {
            let session = self.resume_oauth().await?;
            Agent::from(session)
                .create_record(record, None)
                .await
                .map_err(|e| SdkError::Auth(format!("{what}: {e:?}")))?
        } else {
            self.credential_agent()
                .await?
                .create_record(record, None)
                .await
                .map_err(|e| SdkError::Auth(format!("{what}: {e:?}")))?
        };
        Ok(out.uri.to_string())
    }

    /// Put (upsert) a record at `rkey`, resuming whichever session exists.
    async fn put<R>(&self, rkey: RecordKey<Rkey>, record: R, what: &'static str) -> Result<()>
    where
        R: jacquard_common::types::collection::Collection + serde::Serialize,
    {
        let _guard = self.auth_lock.lock().await;
        if self.is_oauth() {
            let session = self.resume_oauth().await?;
            Agent::from(session)
                .put_record(rkey, record)
                .await
                .map_err(|e| SdkError::Auth(format!("{what}: {e:?}")))?;
        } else {
            self.credential_agent()
                .await?
                .put_record(rkey, record)
                .await
                .map_err(|e| SdkError::Auth(format!("{what}: {e:?}")))?;
        }
        Ok(())
    }

    /// Delete a single record by rkey from `R`'s collection.
    async fn delete<R>(&self, rkey: &str, what: &'static str) -> Result<()>
    where
        R: jacquard_common::types::collection::Collection + serde::Serialize,
    {
        let rk: RecordKey<Rkey> = rkey
            .parse()
            .map_err(|e| SdkError::Auth(format!("rkey: {e}")))?;
        let _guard = self.auth_lock.lock().await;
        if self.is_oauth() {
            Agent::from(self.resume_oauth().await?)
                .delete_record::<R>(rk)
                .await
                .map_err(|e| SdkError::Auth(format!("{what}: {e:?}")))?;
        } else {
            self.credential_agent()
                .await?
                .delete_record::<R>(rk)
                .await
                .map_err(|e| SdkError::Auth(format!("{what}: {e:?}")))?;
        }
        Ok(())
    }

    /// The rkeys of every record in `collection` whose JSON body satisfies
    /// `pred`. Paginates the caller's repo. Used to reconcile likes/follows,
    /// whose record keys are TIDs (not derivable from the subject).
    async fn rkeys_where(
        &self,
        collection: &str,
        pred: impl Fn(&serde_json::Value) -> bool,
    ) -> Result<Vec<String>> {
        let did = self
            .profile()
            .map(|p| p.did)
            .ok_or(SdkError::NotAuthenticated)?;
        let _guard = self.auth_lock.lock().await;
        if self.is_oauth() {
            let agent = Agent::from(self.resume_oauth().await?);
            list_rkeys_where(&agent, &did, collection, pred).await
        } else {
            let agent = self.credential_agent().await?;
            list_rkeys_where(&agent, &did, collection, pred).await
        }
    }
}

/// Record-write convenience verbs — the SDK's high-level surface, mirroring
/// `@atproto/api`'s `post()` / `like()`.
impl RockskyAgent {
    /// Scrobble a play from just a **title + artist** (album optional): resolve
    /// the full canonical metadata via the AppView's match query
    /// (`app.rocksky.song.matchSong`) — album, artwork, duration, track/disc
    /// number, MBID, ISRC, links — and then run the normal [`scrobble`] fan-out.
    ///
    /// This is the convenient default when a client only knows what's playing by
    /// name. If the match comes back empty (unknown track, provider hiccup) it
    /// falls back to a minimal record from the title/artist/album given, so the
    /// scrobble still lands. For full control over every field, build a
    /// [`ScrobbleDraft`] and call [`scrobble`] directly.
    ///
    /// [`scrobble`]: RockskyAgent::scrobble
    pub async fn scrobble_match(
        &self,
        title: &str,
        artist: &str,
        album: Option<&str>,
        mb_id: Option<&str>,
        isrc: Option<&str>,
    ) -> Result<ScrobbleResult> {
        let matched = self.appview.match_song(title, artist, mb_id, isrc).await.ok();
        let draft = match matched.as_ref().filter(|m| {
            m.get("title").and_then(|v| v.as_str()).is_some()
        }) {
            Some(m) => {
                let s = |k: &str| m.get(k).and_then(|v| v.as_str()).map(str::to_string);
                let i = |k: &str| m.get(k).and_then(serde_json::Value::as_i64);
                ScrobbleDraft {
                    title: s("title").unwrap_or_else(|| title.to_string()),
                    artist: s("artist").unwrap_or_else(|| artist.to_string()),
                    // A caller-supplied album wins; else use the matched album.
                    album: album
                        .map(str::to_string)
                        .or_else(|| s("album"))
                        .unwrap_or_default(),
                    album_artist: s("albumArtist").unwrap_or_else(|| artist.to_string()),
                    duration_ms: i("duration").unwrap_or(0),
                    album_art_url: s("albumArt"),
                    track_number: i("trackNumber"),
                    disc_number: i("discNumber"),
                    year: i("year"),
                    release_date: s("releaseDate"),
                    genre: s("genre"),
                    composer: s("composer"),
                    label: s("label"),
                    mbid: s("mbId"),
                    isrc: s("isrc"),
                    spotify_link: s("spotifyLink"),
                    youtube_link: s("youtubeLink"),
                    tidal_link: s("tidalLink"),
                    apple_music_link: s("appleMusicLink"),
                    ..Default::default()
                }
            }
            None => ScrobbleDraft {
                title: title.to_string(),
                artist: artist.to_string(),
                album: album.unwrap_or_default().to_string(),
                album_artist: artist.to_string(),
                ..Default::default()
            },
        };
        self.scrobble(&draft).await
    }

    /// Scrobble a play — the full fan-out, mirroring how Rocksky's indexer
    /// materializes a play. From the draft's metadata it writes (in order) the
    /// **artist**, **album** and **song** records, then the **scrobble** itself,
    /// and returns all four URIs.
    ///
    /// With a dedup store configured, any artist/album/song that already exists is
    /// skipped (its existing URI is reused, nothing is written), and a scrobble of
    /// the same track at the same second is likewise not duplicated. Without a
    /// dedup store every call writes all four records, so a dedup store is
    /// strongly recommended for repeated scrobbling.
    pub async fn scrobble(&self, draft: &ScrobbleDraft) -> Result<ScrobbleResult> {
        // Artist identity is the album artist (matches the server's hash).
        let artist_uri = self
            .create_artist(&ArtistDraft {
                name: draft.album_artist.clone(),
                tags: draft.tags.clone(),
                ..Default::default()
            })
            .await?;
        let album_uri = self
            .create_album(&AlbumDraft {
                title: draft.album.clone(),
                artist: draft.album_artist.clone(),
                year: draft.year,
                release_date: draft.release_date.clone(),
                album_art_url: draft.album_art_url.clone(),
                genre: draft.genre.clone(),
                tags: draft.tags.clone(),
                spotify_link: draft.spotify_link.clone(),
            })
            .await?;
        let song_uri = self
            .create_song(&SongDraft {
                title: draft.title.clone(),
                artist: draft.artist.clone(),
                album: draft.album.clone(),
                album_artist: draft.album_artist.clone(),
                duration_ms: draft.duration_ms,
                album_art_url: draft.album_art_url.clone(),
                track_number: draft.track_number,
                disc_number: draft.disc_number,
                year: draft.year,
                release_date: draft.release_date.clone(),
                genre: draft.genre.clone(),
                tags: draft.tags.clone(),
                composer: draft.composer.clone(),
                label: draft.label.clone(),
                mbid: draft.mbid.clone(),
                isrc: draft.isrc.clone(),
                spotify_link: draft.spotify_link.clone(),
            })
            .await?;
        let scrobble_uri = self.write_scrobble_record(draft).await?;
        Ok(ScrobbleResult {
            artist_uri,
            album_uri,
            song_uri,
            scrobble_uri,
        })
    }

    /// Write only the `app.rocksky.scrobble` record (no artist/album/song
    /// fan-out). Deduped on `(song, second)` when a dedup store is configured.
    async fn write_scrobble_record(&self, draft: &ScrobbleDraft) -> Result<String> {
        let created_at = match draft.timestamp {
            Some(ts) => datetime_from_unix(ts)?,
            None => Datetime::now(),
        };
        #[cfg(feature = "dedup")]
        let secs = created_at.timestamp();
        #[cfg(feature = "dedup")]
        if let Some(idx) = &self.dedup {
            let did = self.did()?;
            if let Some(uri) =
                idx.scrobble_uri(&did, &draft.title, &draft.artist, &draft.album, secs)?
            {
                return Ok(uri);
            }
        }
        let record = Scrobble::new()
            .title(draft.title.clone())
            .artist(draft.artist.clone())
            .album(draft.album.clone())
            .album_artist(draft.album_artist.clone())
            .duration(draft.duration_ms)
            .created_at(created_at)
            .maybe_album_art_url(draft.album_art_url.as_deref().and_then(parse_uri))
            .maybe_track_number(draft.track_number)
            .maybe_disc_number(draft.disc_number)
            .maybe_year(draft.year)
            .maybe_release_date(draft.release_date.as_deref().and_then(parse_datetime))
            .maybe_genre(draft.genre.clone().map(Into::into))
            .maybe_tags(non_empty_tags(&draft.tags))
            .maybe_composer(draft.composer.clone().map(Into::into))
            .maybe_label(draft.label.clone().map(Into::into))
            .maybe_mbid(draft.mbid.clone().map(Into::into))
            .maybe_isrc(draft.isrc.clone().map(Into::into))
            .maybe_spotify_link(draft.spotify_link.as_deref().and_then(parse_uri))
            .maybe_youtube_link(draft.youtube_link.as_deref().and_then(parse_uri))
            .maybe_tidal_link(draft.tidal_link.as_deref().and_then(parse_uri))
            .maybe_apple_music_link(draft.apple_music_link.as_deref().and_then(parse_uri))
            .build();
        let uri = self.create(record, "create scrobble").await?;
        #[cfg(feature = "dedup")]
        if let Some(idx) = &self.dedup {
            let did = self.did()?;
            idx.record_scrobble(&did, &draft.title, &draft.artist, &draft.album, secs, &uri)?;
        }
        Ok(uri)
    }

    /// Create a canonical track record (`app.rocksky.song`). With a dedup store,
    /// returns the existing URI when a song with the same identity
    /// (`title`+`artist`+`album`) is already in the repo, writing nothing.
    pub async fn create_song(&self, draft: &SongDraft) -> Result<String> {
        #[cfg(feature = "dedup")]
        if let Some(idx) = &self.dedup {
            let did = self.did()?;
            if let Some(uri) = idx.song_uri(&did, &draft.title, &draft.artist, &draft.album)? {
                return Ok(uri);
            }
        }
        let record = Song::new()
            .title(draft.title.clone())
            .artist(draft.artist.clone())
            .album(draft.album.clone())
            .album_artist(draft.album_artist.clone())
            .duration(draft.duration_ms)
            .created_at(Datetime::now())
            .maybe_album_art_url(draft.album_art_url.as_deref().and_then(parse_uri))
            .maybe_track_number(draft.track_number)
            .maybe_disc_number(draft.disc_number)
            .maybe_year(draft.year)
            .maybe_release_date(draft.release_date.as_deref().and_then(parse_datetime))
            .maybe_genre(draft.genre.clone().map(Into::into))
            .maybe_tags(non_empty_tags(&draft.tags))
            .maybe_composer(draft.composer.clone().map(Into::into))
            .maybe_label(draft.label.clone().map(Into::into))
            .maybe_mbid(draft.mbid.clone().map(Into::into))
            .maybe_isrc(draft.isrc.clone().map(Into::into))
            .maybe_spotify_link(draft.spotify_link.as_deref().and_then(parse_uri))
            .build();
        let uri = self.create(record, "create song").await?;
        #[cfg(feature = "dedup")]
        if let Some(idx) = &self.dedup {
            let did = self.did()?;
            idx.record_song(&did, &draft.title, &draft.artist, &draft.album, &uri)?;
        }
        Ok(uri)
    }

    /// Create an album record (`app.rocksky.album`). With a dedup store, returns
    /// the existing URI when an album with the same identity (`title`+`artist`)
    /// is already in the repo, writing nothing.
    pub async fn create_album(&self, draft: &AlbumDraft) -> Result<String> {
        #[cfg(feature = "dedup")]
        if let Some(idx) = &self.dedup {
            let did = self.did()?;
            if let Some(uri) = idx.album_uri(&did, &draft.title, &draft.artist)? {
                return Ok(uri);
            }
        }
        let record = Album::new()
            .title(draft.title.clone())
            .artist(draft.artist.clone())
            .created_at(Datetime::now())
            .maybe_album_art_url(draft.album_art_url.as_deref().and_then(parse_uri))
            .maybe_year(draft.year)
            .maybe_release_date(draft.release_date.as_deref().and_then(parse_datetime))
            .maybe_genre(draft.genre.clone().map(Into::into))
            .maybe_tags(non_empty_tags(&draft.tags))
            .maybe_spotify_link(draft.spotify_link.as_deref().and_then(parse_uri))
            .build();
        let uri = self.create(record, "create album").await?;
        #[cfg(feature = "dedup")]
        if let Some(idx) = &self.dedup {
            let did = self.did()?;
            idx.record_album(&did, &draft.title, &draft.artist, &uri)?;
        }
        Ok(uri)
    }

    /// Create an artist record (`app.rocksky.artist`). With a dedup store, returns
    /// the existing URI when an artist with the same identity (`name`) is already
    /// in the repo, writing nothing.
    pub async fn create_artist(&self, draft: &ArtistDraft) -> Result<String> {
        #[cfg(feature = "dedup")]
        if let Some(idx) = &self.dedup {
            let did = self.did()?;
            if let Some(uri) = idx.artist_uri(&did, &draft.name)? {
                return Ok(uri);
            }
        }
        let record = Artist::new()
            .name(draft.name.clone())
            .created_at(Datetime::now())
            .maybe_picture_url(draft.picture_url.as_deref().and_then(parse_uri))
            .maybe_bio(draft.bio.clone().map(Into::into))
            .maybe_tags(non_empty_tags(&draft.tags))
            .build();
        let uri = self.create(record, "create artist").await?;
        #[cfg(feature = "dedup")]
        if let Some(idx) = &self.dedup {
            let did = self.did()?;
            idx.record_artist(&did, &draft.name, &uri)?;
        }
        Ok(uri)
    }

    /// Set the actor's now-playing status singleton (`app.rocksky.actor.status`,
    /// rkey `self`). Upserts, so calling it again just refreshes the record.
    pub async fn set_now_playing(&self, track: &NowPlaying) -> Result<()> {
        let view = TrackView {
            name: track.name.clone().into(),
            artist: track.artist.clone().into(),
            album: track.album.clone().map(Into::into),
            album_cover_url: track.album_cover_url.as_deref().and_then(parse_uri),
            duration_ms: track.duration_ms,
            source: track.source.clone().map(Into::into),
            recording_mb_id: track.recording_mb_id.clone().map(Into::into),
            extra_data: None,
        };
        let record = ActorStatus::new()
            .track(view)
            .started_at(Datetime::now())
            .maybe_expires_at(track.expires_at.clone())
            .build();
        self.put(self_rkey()?, record, "set now playing").await
    }

    /// Delete the actor's now-playing status singleton (rkey `self`).
    pub async fn clear_now_playing(&self) -> Result<()> {
        self.delete::<ActorStatus>("self", "clear now playing")
            .await
    }

    /// Like a record by strong reference (`app.rocksky.like`). `uri`/`cid`
    /// identify the target (a scrobble, song, artist, album, …). Returns the
    /// like record URI.
    pub async fn like(&self, uri: &str, cid: &str) -> Result<String> {
        let record = Like::new()
            .subject(strong_ref(uri, cid)?)
            .created_at(Datetime::now())
            .build();
        self.create(record, "create like").await
    }

    /// Remove every `app.rocksky.like` in the caller's repo whose subject URI
    /// equals `uri`.
    pub async fn unlike(&self, uri: &str) -> Result<()> {
        let rkeys = self
            .rkeys_where("app.rocksky.like", |v| subject_uri_is(v, uri))
            .await?;
        for rkey in rkeys {
            self.delete::<Like>(&rkey, "delete like").await?;
        }
        Ok(())
    }

    /// Follow another account by DID (`app.rocksky.graph.follow`). Returns the
    /// follow record URI.
    pub async fn follow(&self, did: &str) -> Result<String> {
        let subject = Did::new_owned(did).map_err(|e| SdkError::Auth(format!("did: {e}")))?;
        let record = Follow::new()
            .subject(subject)
            .created_at(Datetime::now())
            .build();
        self.create(record, "create follow").await
    }

    /// Unfollow an account: delete every `app.rocksky.graph.follow` in the
    /// caller's repo whose `subject` DID equals `did`.
    pub async fn unfollow(&self, did: &str) -> Result<()> {
        let rkeys = self
            .rkeys_where("app.rocksky.graph.follow", |v| {
                v.get("subject").and_then(|s| s.as_str()) == Some(did)
            })
            .await?;
        for rkey in rkeys {
            self.delete::<Follow>(&rkey, "delete follow").await?;
        }
        Ok(())
    }

    /// Post a shout on a subject (`app.rocksky.shout`). The subject strong-ref
    /// may target any record (a scrobble, artist, album, profile, …). Returns
    /// the shout URI.
    pub async fn shout(
        &self,
        subject_uri: &str,
        subject_cid: &str,
        message: &str,
    ) -> Result<String> {
        let record = Shout::new()
            .subject(strong_ref(subject_uri, subject_cid)?)
            .message(message.to_string())
            .created_at(Datetime::now())
            .build();
        self.create(record, "create shout").await
    }

    /// Reply to another shout: like [`shout`](Self::shout) but with a `parent`
    /// strong-ref pointing at the shout being replied to.
    pub async fn reply_shout(
        &self,
        subject_uri: &str,
        subject_cid: &str,
        parent_uri: &str,
        parent_cid: &str,
        message: &str,
    ) -> Result<String> {
        let record = Shout::new()
            .subject(strong_ref(subject_uri, subject_cid)?)
            .maybe_parent(Some(strong_ref(parent_uri, parent_cid)?))
            .message(message.to_string())
            .created_at(Datetime::now())
            .build();
        self.create(record, "create shout reply").await
    }
}

/// Duplicate-prevention index management (the `dedup` feature).
#[cfg(feature = "dedup")]
impl RockskyAgent {
    /// The configured duplicate-prevention index, if any.
    pub fn dedup_index(&self) -> Option<&crate::dedup::RepoIndex> {
        self.dedup.as_deref()
    }

    /// Download the caller's repository and (re)build the dedup index from it.
    ///
    /// Fast by construction: it stores the last-indexed commit `rev` and passes
    /// it as `since` on the next call, so subsequent syncs download and index only
    /// the records added since — not the whole repo. Requires a dedup store
    /// (`.dedup_store(path)`) and a live session. Returns what was indexed.
    pub async fn sync_repo(&self) -> Result<crate::dedup::IndexStats> {
        let did = self.did()?;
        let idx = self
            .dedup
            .clone()
            .ok_or_else(|| SdkError::Other("no dedup store configured".into()))?;
        let since = idx.last_rev(&did)?;
        let car = self.get_repo(&did, since.as_deref()).await?;
        idx.index_car(&did, &car)
    }

    /// Continuously hydrate the dedup index from the Bluesky Jetstream firehose,
    /// filtered to this account's DID and `app.rocksky.*`, connecting to all four
    /// public servers at once. Runs until the future is dropped/cancelled;
    /// reconnects with backoff and resumes from the persisted cursor.
    ///
    /// Typical use is `sync_repo()` once for the backfill, then this on a
    /// background task: `tokio::spawn(async move { agent.hydrate_from_jetstream().await })`.
    #[cfg(feature = "jetstream")]
    pub async fn hydrate_from_jetstream(&self) -> Result<()> {
        self.hydrate_from_jetstream_with(crate::jetstream::JetstreamConfig::default())
            .await
    }

    /// [`hydrate_from_jetstream`](Self::hydrate_from_jetstream) with an explicit
    /// [`crate::jetstream::JetstreamConfig`].
    #[cfg(feature = "jetstream")]
    pub async fn hydrate_from_jetstream_with(
        &self,
        config: crate::jetstream::JetstreamConfig,
    ) -> Result<()> {
        let did = self.did()?;
        let idx = self
            .dedup
            .clone()
            .ok_or_else(|| SdkError::Other("no dedup store configured".into()))?;
        crate::jetstream::run(idx, did, config).await
    }

    /// Fetch a repo (or, with `since`, the diff after that commit rev) as raw CAR
    /// bytes via `com.atproto.sync.getRepo`, through whichever session exists.
    async fn get_repo(&self, did: &str, since: Option<&str>) -> Result<Vec<u8>> {
        use jacquard::api::com_atproto::sync::get_repo::GetRepo;
        use jacquard::types::string::Tid;

        let d = Did::new_owned(did).map_err(|e| SdkError::Auth(format!("did: {e}")))?;
        let since_tid = since.and_then(|s| s.parse::<Tid>().ok());
        let req = GetRepo::new().did(d).maybe_since(since_tid).build();

        let _guard = self.auth_lock.lock().await;
        let resp = if self.is_oauth() {
            let agent = Agent::from(self.resume_oauth().await?);
            XrpcClient::send(&agent, req)
                .await
                .map_err(|e| SdkError::Auth(format!("getRepo: {e:?}")))?
        } else {
            let agent = self.credential_agent().await?;
            XrpcClient::send(&agent, req)
                .await
                .map_err(|e| SdkError::Auth(format!("getRepo: {e:?}")))?
        };
        Ok(resp.buffer().to_vec())
    }
}

/// The `self` record key used by singleton records (now-playing status).
fn self_rkey() -> Result<RecordKey<Rkey>> {
    "self"
        .parse()
        .map_err(|e| SdkError::Auth(format!("rkey: {e}")))
}

/// Build a `com.atproto.repo.strongRef` from a URI + CID pair.
fn strong_ref(uri: &str, cid: &str) -> Result<StrongRef> {
    let uri = AtUri::new_owned(uri).map_err(|e| SdkError::Auth(format!("uri: {e}")))?;
    let cid = cid
        .parse::<Cid>()
        .map_err(|e| SdkError::Auth(format!("cid: {e}")))?;
    Ok(StrongRef::new().uri(uri).cid(cid).build())
}

/// True when the record's `subject.uri` (strongRef form) equals `uri`.
fn subject_uri_is(v: &serde_json::Value, uri: &str) -> bool {
    v.get("subject")
        .and_then(|s| s.get("uri"))
        .and_then(|u| u.as_str())
        == Some(uri)
}

/// Parse a URL string into a lexicon `UriValue`, dropping anything invalid.
fn parse_uri(s: &str) -> Option<UriValue> {
    UriValue::new_owned(s).ok()
}

/// Parse an RFC 3339 datetime, dropping anything invalid.
fn parse_datetime(s: &str) -> Option<Datetime> {
    s.parse::<Datetime>().ok()
}

/// Build a lexicon `Datetime` from Unix seconds (UTC).
fn datetime_from_unix(ts: i64) -> Result<Datetime> {
    let dt = chrono::DateTime::from_timestamp(ts, 0)
        .ok_or_else(|| SdkError::Other(format!("invalid timestamp: {ts}")))?;
    Ok(Datetime::new(dt.fixed_offset()))
}

/// `Some(tags)` when non-empty, else `None` (the field is omitted when absent).
fn non_empty_tags(tags: &[String]) -> Option<Vec<jacquard_common::DefaultStr>> {
    if tags.is_empty() {
        None
    } else {
        Some(tags.iter().map(|t| t.clone().into()).collect())
    }
}

/// List (paginated) the rkeys of every record in `did`'s `collection` whose JSON
/// body satisfies `pred`. Generic over the session agent (credential or OAuth),
/// both of which are `XrpcClient`s.
async fn list_rkeys_where<A: XrpcClient + Sync>(
    agent: &A,
    did: &str,
    collection: &str,
    pred: impl Fn(&serde_json::Value) -> bool,
) -> Result<Vec<String>> {
    use jacquard::api::com_atproto::repo::list_records::ListRecords;
    use smol_str::SmolStr;

    let repo = AtIdentifier::<SmolStr>::new_owned(did).map_err(auth_err)?;
    let collection = Nsid::<SmolStr>::new_owned(collection).map_err(auth_err)?;

    let mut rkeys = Vec::new();
    let mut cursor: Option<SmolStr> = None;
    loop {
        let req = ListRecords::<SmolStr> {
            collection: collection.clone(),
            cursor: cursor.clone(),
            limit: Some(100),
            repo: repo.clone(),
            reverse: None,
        };
        let resp = XrpcClient::send(agent, req)
            .await
            .map_err(|e| SdkError::Auth(format!("listRecords: {e:?}")))?;
        let page = resp
            .parse::<SmolStr>()
            .map_err(|e| SdkError::Auth(format!("listRecords decode: {e:?}")))?;

        for rec in &page.records {
            let matches = serde_json::to_value(&rec.value)
                .ok()
                .map(|v| pred(&v))
                .unwrap_or(false);
            if matches {
                let uri = rec.uri.to_string();
                if let Some(rkey) = uri.rsplit('/').next() {
                    rkeys.push(rkey.to_string());
                }
            }
        }

        match page.cursor {
            Some(c) if !page.records.is_empty() => cursor = Some(c),
            _ => break,
        }
    }
    Ok(rkeys)
}
