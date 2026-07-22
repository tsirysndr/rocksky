//! Erlang NIF (Rustler) bindings for `rocksky-sdk` — the native core behind the
//! Erlang, Elixir, and Gleam SDKs.
//!
//! The SDK is async and its calls do network I/O, which must never block a BEAM
//! scheduler — so every I/O nif is scheduled on a **dirty IO** scheduler, where
//! `block_on` is safe. Results cross the boundary as JSON strings (Erlang
//! binaries) in a `{"ok"|"error"}` envelope, matching the other Rocksky SDKs;
//! the authenticated agent is a Rustler resource (opaque handle).

use once_cell::sync::Lazy;
use rocksky_sdk::{AlbumDraft, ArtistDraft, NowPlaying, RockskyAgent, ScrobbleDraft, SongDraft};
use rustler::{Resource, ResourceArc};

/// One multi-threaded tokio runtime drives every async SDK call. Dirty-IO nif
/// threads may block on it freely.
static RT: Lazy<tokio::runtime::Runtime> = Lazy::new(|| {
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("tokio runtime")
});

/// Opaque authenticated-agent handle, held on the Erlang side as a resource.
struct AgentRes(RockskyAgent);

#[rustler::resource_impl]
impl Resource for AgentRes {}

fn appview(base: &str) -> rocksky_sdk::AppView {
    if base.is_empty() {
        rocksky_sdk::AppView::new(rocksky_sdk::DEFAULT_APPVIEW)
    } else {
        rocksky_sdk::AppView::new(base)
    }
}

/// Serialize a result into a `{"ok"|"error"}` JSON envelope string.
fn envelope<T: serde::Serialize, E: std::fmt::Display>(r: Result<T, E>) -> String {
    match r {
        Ok(v) => serde_json::json!({ "ok": v }).to_string(),
        Err(e) => serde_json::json!({ "error": e.to_string() }).to_string(),
    }
}

fn parse<T: serde::de::DeserializeOwned>(json: &str) -> Result<T, String> {
    serde_json::from_str(json).map_err(|e| e.to_string())
}

/// The optional `cursor` parameter carried as an empty string for "none".
fn opt(s: &str) -> Option<&str> {
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

// ---- reads (unauthenticated; dirty IO) -----------------------------------

#[rustler::nif(schedule = "DirtyIo")]
fn profile(base: String, actor: String) -> String {
    envelope(RT.block_on(appview(&base).profile(&actor)))
}

#[rustler::nif(schedule = "DirtyIo")]
fn scrobbles(base: String, actor: String, limit: u32, offset: u32) -> String {
    envelope(RT.block_on(appview(&base).scrobbles(&actor, limit, offset)))
}

#[rustler::nif(schedule = "DirtyIo")]
fn songs(base: String, actor: String, limit: u32, offset: u32) -> String {
    envelope(RT.block_on(appview(&base).songs(&actor, limit, offset)))
}

#[rustler::nif(schedule = "DirtyIo")]
fn albums(base: String, actor: String, limit: u32, offset: u32) -> String {
    envelope(RT.block_on(appview(&base).albums(&actor, limit, offset)))
}

#[rustler::nif(schedule = "DirtyIo")]
fn artists(base: String, actor: String, limit: u32, offset: u32) -> String {
    envelope(RT.block_on(appview(&base).artists(&actor, limit, offset)))
}

#[rustler::nif(schedule = "DirtyIo")]
fn feed(base: String, feed_uri: String, limit: u32, cursor: String) -> String {
    envelope(RT.block_on(appview(&base).feed(&feed_uri, limit, opt(&cursor))))
}

#[rustler::nif(schedule = "DirtyIo")]
fn search(base: String, query: String) -> String {
    envelope(RT.block_on(appview(&base).search(&query)))
}

#[rustler::nif(schedule = "DirtyIo")]
fn top_artists(base: String, limit: u32, offset: u32) -> String {
    envelope(RT.block_on(appview(&base).top_artists(limit, offset)))
}

#[rustler::nif(schedule = "DirtyIo")]
fn top_tracks(base: String, limit: u32, offset: u32) -> String {
    envelope(RT.block_on(appview(&base).top_tracks(limit, offset)))
}

#[rustler::nif(schedule = "DirtyIo")]
fn global_stats(base: String) -> String {
    envelope(RT.block_on(appview(&base).global_stats()))
}

// ---- full read-query catalog (dirty IO) ----------------------------------
//
// Every AppView read query. Typed views and the raw-JSON long tail both cross
// the boundary through `envelope` (the JSON `{"ok"|"error"}` wrapper). `get`
// reaches any query by nsid; a treated-as-empty param is dropped.

/// A rolling `n` of `days | weeks | months | years`, `range` (RFC-3339
/// start/end), or `all`. Built here so window math matches every SDK.
fn to_interval(unit: &str, n: u32, start: &str, end: &str) -> Result<rocksky_sdk::DateInterval, String> {
    use rocksky_sdk::DateInterval as C;
    Ok(match unit {
        "" | "all" => C::AllTime,
        "days" => C::LastDays(n),
        "weeks" => C::LastWeeks(n),
        "months" => C::LastMonths(n),
        "years" => C::LastYears(n),
        "range" => C::Range {
            start: start.parse().map_err(|e| format!("bad start datetime: {e}"))?,
            end: end.parse().map_err(|e| format!("bad end datetime: {e}"))?,
        },
        other => return Err(format!("unknown interval unit: {other}")),
    })
}

/// `n = 0` on an optional count param means "unset".
fn opt_u32(n: u32) -> Option<u32> {
    if n == 0 {
        None
    } else {
        Some(n)
    }
}

#[rustler::nif(schedule = "DirtyIo")]
fn get(base: String, nsid: String, params_json: String, token: String) -> String {
    let mut av = appview(&base);
    if !token.is_empty() {
        av.set_token(Some(token));
    }
    // Coerce scalar values (numbers, bools) to strings so callers may pass a
    // JSON object like {"did": "…", "limit": 20}.
    let params: Vec<(String, String)> =
        serde_json::from_str::<std::collections::HashMap<String, serde_json::Value>>(&params_json)
            .map(|m| {
                m.into_iter()
                    .map(|(k, v)| {
                        let sv = match v {
                            serde_json::Value::String(s) => s,
                            serde_json::Value::Null => String::new(),
                            other => other.to_string(),
                        };
                        (k, sv)
                    })
                    .collect()
            })
            .unwrap_or_default();
    envelope(RT.block_on(av.get(&nsid, &params)))
}

#[rustler::nif(schedule = "DirtyIo")]
fn loved_songs(base: String, actor: String, limit: u32, offset: u32) -> String {
    envelope(RT.block_on(appview(&base).loved_songs(&actor, limit, offset)))
}

#[rustler::nif(schedule = "DirtyIo")]
fn top_tracks_interval(
    base: String,
    limit: u32,
    offset: u32,
    unit: String,
    n: u32,
    start: String,
    end: String,
) -> String {
    match to_interval(&unit, n, &start, &end) {
        Ok(iv) => envelope(RT.block_on(appview(&base).top_tracks_interval(limit, offset, iv))),
        Err(e) => envelope::<(), _>(Err(e)),
    }
}

#[rustler::nif(schedule = "DirtyIo")]
fn top_artists_interval(
    base: String,
    limit: u32,
    offset: u32,
    unit: String,
    n: u32,
    start: String,
    end: String,
) -> String {
    match to_interval(&unit, n, &start, &end) {
        Ok(iv) => envelope(RT.block_on(appview(&base).top_artists_interval(limit, offset, iv))),
        Err(e) => envelope::<(), _>(Err(e)),
    }
}

#[rustler::nif(schedule = "DirtyIo")]
fn catalog_albums(base: String, limit: u32, offset: u32, genre: String) -> String {
    envelope(RT.block_on(appview(&base).catalog_albums(limit, offset, opt(&genre))))
}

#[rustler::nif(schedule = "DirtyIo")]
fn catalog_artists(base: String, limit: u32, offset: u32, genre: String) -> String {
    envelope(RT.block_on(appview(&base).catalog_artists(limit, offset, opt(&genre))))
}

#[rustler::nif(schedule = "DirtyIo")]
fn catalog_songs(base: String, limit: u32, offset: u32, genre: String) -> String {
    envelope(RT.block_on(appview(&base).catalog_songs(limit, offset, opt(&genre))))
}

#[rustler::nif(schedule = "DirtyIo")]
fn album_tracks(base: String, uri: String) -> String {
    envelope(RT.block_on(appview(&base).album_tracks(&uri)))
}

#[rustler::nif(schedule = "DirtyIo")]
fn artist_albums(base: String, uri: String) -> String {
    envelope(RT.block_on(appview(&base).artist_albums(&uri)))
}

#[rustler::nif(schedule = "DirtyIo")]
fn artist_tracks(base: String, uri: String, limit: u32, offset: u32) -> String {
    envelope(RT.block_on(appview(&base).artist_tracks(&uri, limit, offset)))
}

#[rustler::nif(schedule = "DirtyIo")]
fn scrobble_feed(base: String, did: String, following: bool, limit: u32, offset: u32) -> String {
    envelope(RT.block_on(appview(&base).scrobble_feed(opt(&did), following, limit, offset)))
}

#[rustler::nif(schedule = "DirtyIo")]
fn scrobble(base: String, uri: String) -> String {
    envelope(RT.block_on(appview(&base).scrobble(&uri)))
}

#[rustler::nif(schedule = "DirtyIo")]
fn follows(base: String, actor: String, limit: u32, cursor: String) -> String {
    envelope(RT.block_on(appview(&base).follows(&actor, limit, opt(&cursor))))
}

#[rustler::nif(schedule = "DirtyIo")]
fn followers(base: String, actor: String, limit: u32, cursor: String) -> String {
    envelope(RT.block_on(appview(&base).followers(&actor, limit, opt(&cursor))))
}

#[rustler::nif(schedule = "DirtyIo")]
fn known_followers(base: String, actor: String, limit: u32, cursor: String) -> String {
    envelope(RT.block_on(appview(&base).known_followers(&actor, limit, opt(&cursor))))
}

#[rustler::nif(schedule = "DirtyIo")]
fn album(base: String, uri: String) -> String {
    envelope(RT.block_on(appview(&base).album(&uri)))
}

#[rustler::nif(schedule = "DirtyIo")]
fn artist(base: String, uri: String) -> String {
    envelope(RT.block_on(appview(&base).artist(&uri)))
}

#[rustler::nif(schedule = "DirtyIo")]
fn match_song(base: String, title: String, artist: String, mb_id: String, isrc: String) -> String {
    envelope(RT.block_on(appview(&base).match_song(
        &title,
        &artist,
        opt(&mb_id),
        opt(&isrc),
    )))
}

#[rustler::nif(schedule = "DirtyIo")]
fn song(base: String, uri: String, mbid: String, isrc: String, spotify_id: String) -> String {
    envelope(RT.block_on(appview(&base).song(
        opt(&uri),
        opt(&mbid),
        opt(&isrc),
        opt(&spotify_id),
    )))
}

#[rustler::nif(schedule = "DirtyIo")]
fn actor_playlists(base: String, actor: String, limit: u32, offset: u32) -> String {
    envelope(RT.block_on(appview(&base).actor_playlists(&actor, limit, offset)))
}

#[rustler::nif(schedule = "DirtyIo")]
fn neighbours(base: String, actor: String) -> String {
    envelope(RT.block_on(appview(&base).neighbours(&actor)))
}

#[rustler::nif(schedule = "DirtyIo")]
fn compatibility(base: String, actor: String) -> String {
    envelope(RT.block_on(appview(&base).compatibility(&actor)))
}

#[rustler::nif(schedule = "DirtyIo")]
fn artist_listeners(base: String, uri: String, limit: u32, offset: u32) -> String {
    envelope(RT.block_on(appview(&base).artist_listeners(&uri, limit, offset)))
}

#[rustler::nif(schedule = "DirtyIo")]
fn artist_recent_listeners(base: String, uri: String, limit: u32, offset: u32) -> String {
    envelope(RT.block_on(appview(&base).artist_recent_listeners(&uri, limit, offset)))
}

#[rustler::nif(schedule = "DirtyIo")]
fn song_recent_listeners(base: String, uri: String, limit: u32, offset: u32) -> String {
    envelope(RT.block_on(appview(&base).song_recent_listeners(&uri, limit, offset)))
}

#[rustler::nif(schedule = "DirtyIo")]
fn scrobbles_chart(
    base: String,
    did: String,
    artist_uri: String,
    album_uri: String,
    song_uri: String,
    genre: String,
    from: String,
    to: String,
) -> String {
    envelope(RT.block_on(appview(&base).scrobbles_chart(
        opt(&did),
        opt(&artist_uri),
        opt(&album_uri),
        opt(&song_uri),
        opt(&genre),
        opt(&from),
        opt(&to),
    )))
}

#[rustler::nif(schedule = "DirtyIo")]
fn feed_generators(base: String, size: u32) -> String {
    envelope(RT.block_on(appview(&base).feed_generators(opt_u32(size))))
}

#[rustler::nif(schedule = "DirtyIo")]
fn feed_generator(base: String, feed_uri: String) -> String {
    envelope(RT.block_on(appview(&base).feed_generator(&feed_uri)))
}

#[rustler::nif(schedule = "DirtyIo")]
fn stories(base: String, size: u32, feed_uri: String, following: bool) -> String {
    envelope(RT.block_on(appview(&base).stories(opt_u32(size), opt(&feed_uri), Some(following))))
}

#[rustler::nif(schedule = "DirtyIo")]
fn recommendations(base: String, actor: String, limit: u32) -> String {
    envelope(RT.block_on(appview(&base).recommendations(&actor, opt_u32(limit))))
}

#[rustler::nif(schedule = "DirtyIo")]
fn artist_recommendations(base: String, actor: String, limit: u32) -> String {
    envelope(RT.block_on(appview(&base).artist_recommendations(&actor, opt_u32(limit))))
}

#[rustler::nif(schedule = "DirtyIo")]
fn album_recommendations(base: String, actor: String, limit: u32) -> String {
    envelope(RT.block_on(appview(&base).album_recommendations(&actor, opt_u32(limit))))
}

#[rustler::nif(schedule = "DirtyIo")]
fn stats(base: String, actor: String) -> String {
    envelope(RT.block_on(appview(&base).stats(&actor)))
}

#[rustler::nif(schedule = "DirtyIo")]
fn wrapped(base: String, actor: String, year: u32) -> String {
    envelope(RT.block_on(appview(&base).wrapped(&actor, opt_u32(year))))
}

#[rustler::nif(schedule = "DirtyIo")]
fn mirror_sources(base: String) -> String {
    envelope(RT.block_on(appview(&base).mirror_sources()))
}

#[rustler::nif(schedule = "DirtyIo")]
fn currently_playing(base: String, player_id: String, actor: String) -> String {
    envelope(RT.block_on(appview(&base).currently_playing(opt(&player_id), opt(&actor))))
}

#[rustler::nif(schedule = "DirtyIo")]
fn playback_queue(base: String, player_id: String) -> String {
    envelope(RT.block_on(appview(&base).playback_queue(&player_id)))
}

#[rustler::nif(schedule = "DirtyIo")]
fn spotify_currently_playing(base: String, actor: String) -> String {
    envelope(RT.block_on(appview(&base).spotify_currently_playing(&actor)))
}

#[rustler::nif(schedule = "DirtyIo")]
fn playlists(base: String, limit: u32, offset: u32) -> String {
    envelope(RT.block_on(appview(&base).playlists(limit, offset)))
}

#[rustler::nif(schedule = "DirtyIo")]
fn playlist(base: String, uri: String) -> String {
    envelope(RT.block_on(appview(&base).playlist(&uri)))
}

#[rustler::nif(schedule = "DirtyIo")]
fn album_shouts(base: String, uri: String, limit: u32, offset: u32) -> String {
    envelope(RT.block_on(appview(&base).album_shouts(&uri, limit, offset)))
}

#[rustler::nif(schedule = "DirtyIo")]
fn artist_shouts(base: String, uri: String, limit: u32, offset: u32) -> String {
    envelope(RT.block_on(appview(&base).artist_shouts(&uri, limit, offset)))
}

#[rustler::nif(schedule = "DirtyIo")]
fn profile_shouts(base: String, actor: String, limit: u32, offset: u32) -> String {
    envelope(RT.block_on(appview(&base).profile_shouts(&actor, limit, offset)))
}

#[rustler::nif(schedule = "DirtyIo")]
fn track_shouts(base: String, uri: String) -> String {
    envelope(RT.block_on(appview(&base).track_shouts(&uri)))
}

#[rustler::nif(schedule = "DirtyIo")]
fn shout_replies(base: String, uri: String, limit: u32, offset: u32) -> String {
    envelope(RT.block_on(appview(&base).shout_replies(&uri, limit, offset)))
}

#[rustler::nif(schedule = "DirtyIo")]
fn audio_settings(base: String, actor: String) -> String {
    envelope(RT.block_on(appview(&base).audio_settings(&actor)))
}

#[rustler::nif(schedule = "DirtyIo")]
fn apikeys(base: String, limit: u32, offset: u32) -> String {
    envelope(RT.block_on(appview(&base).apikeys(limit, offset)))
}

// ---- identity hashes (pure + fast; normal scheduler) ---------------------

#[rustler::nif]
fn song_hash(title: String, artist: String, album: String) -> String {
    rocksky_sdk::dedup::song_hash(&title, &artist, &album)
}

#[rustler::nif]
fn album_hash(album: String, album_artist: String) -> String {
    rocksky_sdk::dedup::album_hash(&album, &album_artist)
}

#[rustler::nif]
fn artist_hash(album_artist: String) -> String {
    rocksky_sdk::dedup::artist_hash(&album_artist)
}

// ---- authenticated agent (dirty IO) --------------------------------------

/// Log in with an app password. `dedup_path` may be empty (no local index); it
/// is honored only when the crate is built with the `dedup` feature.
#[rustler::nif(schedule = "DirtyIo")]
fn agent_login(
    session_path: String,
    identifier: String,
    password: String,
    appview: String,
    dedup_path: String,
) -> Result<ResourceArc<AgentRes>, rustler::Error> {
    let mut builder = RockskyAgent::builder().session_store(session_path);
    if !appview.is_empty() {
        builder = builder.appview(appview);
    }
    #[cfg(feature = "dedup")]
    if !dedup_path.is_empty() {
        builder = builder.dedup_store(dedup_path);
    }
    #[cfg(not(feature = "dedup"))]
    let _ = &dedup_path;
    let agent = builder
        .build()
        .map_err(|e| rustler::Error::Term(Box::new(e.to_string())))?;
    RT.block_on(agent.login_password(&identifier, &password))
        .map_err(|e| rustler::Error::Term(Box::new(e.to_string())))?;
    Ok(ResourceArc::new(AgentRes(agent)))
}

#[rustler::nif]
fn agent_did(agent: ResourceArc<AgentRes>) -> String {
    envelope::<_, String>(Ok(agent.0.profile().map(|p| p.did)))
}

#[rustler::nif(schedule = "DirtyIo")]
fn agent_refresh_session(agent: ResourceArc<AgentRes>) -> String {
    envelope(RT.block_on(agent.0.refresh_session()).map(|_| true))
}

/// Scrobble a play (fans out to artist/album/song/scrobble). `draft_json` is a
/// `ScrobbleDraft` (camelCase). Returns the four record URIs.
#[rustler::nif(schedule = "DirtyIo")]
fn agent_scrobble(agent: ResourceArc<AgentRes>, draft_json: String) -> String {
    match parse::<ScrobbleDraft>(&draft_json) {
        Ok(d) => envelope(RT.block_on(agent.0.scrobble(&d))),
        Err(e) => envelope::<(), _>(Err(e)),
    }
}

/// Scrobble from a bare title + artist (album optional): resolve full metadata
/// via matchSong, then fan out.
#[rustler::nif(schedule = "DirtyIo")]
fn agent_scrobble_match(
    agent: ResourceArc<AgentRes>,
    title: String,
    artist: String,
    album: String,
) -> String {
    envelope(RT.block_on(agent.0.scrobble_match(&title, &artist, opt(&album))))
}

#[rustler::nif(schedule = "DirtyIo")]
fn agent_create_song(agent: ResourceArc<AgentRes>, draft_json: String) -> String {
    match parse::<SongDraft>(&draft_json) {
        Ok(d) => envelope(RT.block_on(agent.0.create_song(&d))),
        Err(e) => envelope::<(), _>(Err(e)),
    }
}

#[rustler::nif(schedule = "DirtyIo")]
fn agent_create_album(agent: ResourceArc<AgentRes>, draft_json: String) -> String {
    match parse::<AlbumDraft>(&draft_json) {
        Ok(d) => envelope(RT.block_on(agent.0.create_album(&d))),
        Err(e) => envelope::<(), _>(Err(e)),
    }
}

#[rustler::nif(schedule = "DirtyIo")]
fn agent_create_artist(agent: ResourceArc<AgentRes>, draft_json: String) -> String {
    match parse::<ArtistDraft>(&draft_json) {
        Ok(d) => envelope(RT.block_on(agent.0.create_artist(&d))),
        Err(e) => envelope::<(), _>(Err(e)),
    }
}

#[rustler::nif(schedule = "DirtyIo")]
fn agent_like(agent: ResourceArc<AgentRes>, uri: String, cid: String) -> String {
    envelope(RT.block_on(agent.0.like(&uri, &cid)))
}

#[rustler::nif(schedule = "DirtyIo")]
fn agent_unlike(agent: ResourceArc<AgentRes>, uri: String) -> String {
    envelope(RT.block_on(agent.0.unlike(&uri)).map(|_| true))
}

#[rustler::nif(schedule = "DirtyIo")]
fn agent_follow(agent: ResourceArc<AgentRes>, did: String) -> String {
    envelope(RT.block_on(agent.0.follow(&did)))
}

#[rustler::nif(schedule = "DirtyIo")]
fn agent_unfollow(agent: ResourceArc<AgentRes>, did: String) -> String {
    envelope(RT.block_on(agent.0.unfollow(&did)).map(|_| true))
}

#[rustler::nif(schedule = "DirtyIo")]
fn agent_shout(
    agent: ResourceArc<AgentRes>,
    subject_uri: String,
    subject_cid: String,
    message: String,
) -> String {
    envelope(RT.block_on(agent.0.shout(&subject_uri, &subject_cid, &message)))
}

#[rustler::nif(schedule = "DirtyIo")]
fn agent_reply_shout(
    agent: ResourceArc<AgentRes>,
    subject_uri: String,
    subject_cid: String,
    parent_uri: String,
    parent_cid: String,
    message: String,
) -> String {
    envelope(RT.block_on(agent.0.reply_shout(
        &subject_uri,
        &subject_cid,
        &parent_uri,
        &parent_cid,
        &message,
    )))
}

#[rustler::nif(schedule = "DirtyIo")]
fn agent_set_now_playing(agent: ResourceArc<AgentRes>, track_json: String) -> String {
    match parse::<NowPlaying>(&track_json) {
        Ok(t) => envelope(RT.block_on(agent.0.set_now_playing(&t)).map(|_| true)),
        Err(e) => envelope::<(), _>(Err(e)),
    }
}

#[rustler::nif(schedule = "DirtyIo")]
fn agent_clear_now_playing(agent: ResourceArc<AgentRes>) -> String {
    envelope(RT.block_on(agent.0.clear_now_playing()).map(|_| true))
}

// ---- dedup / jetstream (feature-gated) -----------------------------------

/// Download the caller's repo and (re)build the local dedup index.
#[cfg(feature = "dedup")]
#[rustler::nif(schedule = "DirtyIo")]
fn agent_sync_repo(agent: ResourceArc<AgentRes>) -> String {
    match RT.block_on(agent.0.sync_repo()) {
        Ok(s) => serde_json::json!({
            "ok": {
                "artists": s.artists,
                "albums": s.albums,
                "songs": s.songs,
                "scrobbles": s.scrobbles,
                "total": s.total(),
            }
        })
        .to_string(),
        Err(e) => envelope::<(), _>(Err(e.to_string())),
    }
}

/// Start hydrating the dedup index from Jetstream on a background task and return
/// immediately (`{"ok": true}`). The hydration runs for the life of the runtime.
#[cfg(feature = "jetstream")]
#[rustler::nif]
fn agent_hydrate_from_jetstream(agent: ResourceArc<AgentRes>) -> String {
    let agent = agent.0.clone();
    RT.spawn(async move {
        if let Err(e) = agent.hydrate_from_jetstream().await {
            tracing::warn!(error = %e, "jetstream hydration stopped");
        }
    });
    serde_json::json!({ "ok": true }).to_string()
}

rustler::init!("rocksky_nif");
