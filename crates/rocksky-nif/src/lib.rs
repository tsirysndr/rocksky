//! Erlang NIF (Rustler) bindings for `rocksky-sdk` — the native core behind the
//! Erlang, Elixir, and Gleam SDKs.
//!
//! The SDK is async and its calls do network I/O, which must never block a BEAM
//! scheduler — so every I/O nif is scheduled on a **dirty IO** scheduler, where
//! `block_on` is safe. Results cross the boundary as JSON strings (Erlang
//! binaries) in a `{"ok"|"error"}` envelope, matching the other Rocksky SDKs;
//! the authenticated agent is a Rustler resource (opaque handle).

use once_cell::sync::Lazy;
use rocksky_sdk::{
    AlbumDraft, ArtistDraft, NowPlaying, RockskyAgent, ScrobbleDraft, ScrobbleMatch, SongDraft,
};
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
fn to_interval(
    unit: &str,
    n: u32,
    start: &str,
    end: &str,
) -> Result<rocksky_sdk::DateInterval, String> {
    use rocksky_sdk::DateInterval as C;
    Ok(match unit {
        "" | "all" => C::AllTime,
        "days" => C::LastDays(n),
        "weeks" => C::LastWeeks(n),
        "months" => C::LastMonths(n),
        "years" => C::LastYears(n),
        "range" => C::Range {
            start: start
                .parse()
                .map_err(|e| format!("bad start datetime: {e}"))?,
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

/// Mark notifications as viewed (`app.rocksky.notification.updateSeen`). `token`
/// is required. `ids_json` is a JSON array of notification ids, or `[]` to mark
/// **all** as viewed. Returns the typed `{ "unreadCount": <int> }` result.
#[rustler::nif(schedule = "DirtyIo")]
fn update_seen(base: String, token: String, ids_json: String) -> String {
    let mut av = appview(&base);
    if !token.is_empty() {
        av.set_token(Some(token));
    }
    let ids: Vec<String> = serde_json::from_str(&ids_json).unwrap_or_default();
    envelope(RT.block_on(av.update_seen(&ids)))
}

/// Parse a JSON GIF embed (`app.rocksky.shout.defs#gif`) into a
/// [`rocksky_sdk::ShoutGif`]. Empty or invalid input yields `None`.
fn parse_gif(gif_json: &str) -> Option<rocksky_sdk::ShoutGif> {
    if gif_json.is_empty() {
        return None;
    }
    serde_json::from_str::<rocksky_sdk::ShoutGif>(gif_json).ok()
}

/// Coerce a JSON object of params into string pairs (numbers/bools stringified).
fn params_from_json(params_json: &str) -> Vec<(String, String)> {
    serde_json::from_str::<std::collections::HashMap<String, serde_json::Value>>(params_json)
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
        .unwrap_or_default()
}

/// Build a token-enforced library client (empty token → error).
fn library_core(base: &str, token: &str) -> Result<rocksky_sdk::Library, String> {
    let base = if base.is_empty() {
        rocksky_sdk::DEFAULT_APPVIEW.to_string()
    } else {
        base.to_string()
    };
    rocksky_sdk::Library::new(base, token).map_err(|e| e.to_string())
}

/// Call any authenticated `app.rocksky.library.*` query by nsid. `token` is
/// required — empty yields an `{"error": …}` envelope.
#[rustler::nif(schedule = "DirtyIo")]
fn library_get(base: String, token: String, nsid: String, params_json: String) -> String {
    match library_core(&base, &token) {
        Ok(lib) => envelope(RT.block_on(lib.get(&nsid, params_from_json(&params_json)))),
        Err(e) => envelope(Err::<serde_json::Value, String>(e)),
    }
}

/// Call any authenticated `app.rocksky.library.*` procedure by nsid with a JSON
/// input body. `token` is required.
#[rustler::nif(schedule = "DirtyIo")]
fn library_post(base: String, token: String, nsid: String, body_json: String) -> String {
    match library_core(&base, &token) {
        Ok(lib) => {
            let body: serde_json::Value =
                serde_json::from_str(&body_json).unwrap_or(serde_json::Value::Null);
            envelope(RT.block_on(lib.post(&nsid, body)))
        }
        Err(e) => envelope(Err::<serde_json::Value, String>(e)),
    }
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

// The catalog/feed NIFs keep their published arities; RSQL filtering from the
// BEAM SDKs goes through the generic `get` NIF instead.
#[rustler::nif(schedule = "DirtyIo")]
fn catalog_albums(base: String, limit: u32, offset: u32, genre: String) -> String {
    envelope(RT.block_on(appview(&base).catalog_albums(limit, offset, opt(&genre), None)))
}

#[rustler::nif(schedule = "DirtyIo")]
fn catalog_artists(base: String, limit: u32, offset: u32, genre: String) -> String {
    envelope(RT.block_on(appview(&base).catalog_artists(limit, offset, opt(&genre), None)))
}

#[rustler::nif(schedule = "DirtyIo")]
fn catalog_songs(base: String, limit: u32, offset: u32, genre: String) -> String {
    envelope(RT.block_on(appview(&base).catalog_songs(limit, offset, opt(&genre), None)))
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
    envelope(RT.block_on(appview(&base).scrobble_feed(opt(&did), following, limit, offset, None)))
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
    envelope(RT.block_on(appview(&base).match_song(&title, &artist, opt(&mb_id), opt(&isrc))))
}

#[rustler::nif(schedule = "DirtyIo")]
fn song(base: String, uri: String, mbid: String, isrc: String, spotify_id: String) -> String {
    envelope(RT.block_on(appview(&base).song(opt(&uri), opt(&mbid), opt(&isrc), opt(&spotify_id))))
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
fn agent_scrobble_match(agent: ResourceArc<AgentRes>, input_json: String) -> String {
    match parse::<ScrobbleMatch>(&input_json) {
        Ok(m) => envelope(RT.block_on(agent.0.scrobble_match(&m))),
        Err(e) => envelope::<(), _>(Err(e)),
    }
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

/// Post a shout with an optional GIF/sticker/clip. `message` may be empty when a
/// `gif_json` embed is supplied (pass at least one); `gif_json` empty = no gif.
#[rustler::nif(schedule = "DirtyIo")]
fn agent_shout_with_gif(
    agent: ResourceArc<AgentRes>,
    subject_uri: String,
    subject_cid: String,
    message: String,
    gif_json: String,
) -> String {
    let message = if message.is_empty() {
        None
    } else {
        Some(message)
    };
    let gif = parse_gif(&gif_json);
    envelope(
        RT.block_on(
            agent
                .0
                .shout_with_gif(&subject_uri, &subject_cid, message.as_deref(), gif),
        ),
    )
}

/// Reply to a shout with an optional GIF/sticker/clip. Semantics match
/// [`agent_shout_with_gif`], plus a `parent` strong-ref.
#[rustler::nif(schedule = "DirtyIo")]
fn agent_reply_shout_with_gif(
    agent: ResourceArc<AgentRes>,
    subject_uri: String,
    subject_cid: String,
    parent_uri: String,
    parent_cid: String,
    message: String,
    gif_json: String,
) -> String {
    let message = if message.is_empty() {
        None
    } else {
        Some(message)
    };
    let gif = parse_gif(&gif_json);
    envelope(RT.block_on(agent.0.reply_shout_with_gif(
        &subject_uri,
        &subject_cid,
        &parent_uri,
        &parent_cid,
        message.as_deref(),
        gif,
    )))
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

// ---- remote player (Rocksky-controllable player over the WebSocket) ------
//
// An opaque resource over `rocksky_sdk::RemotePlayer`. It registers and runs in
// the background; the Erlang side polls `remote_player_next_command` in a loop
// (dirty IO — it blocks until a command arrives, or returns `null` once
// disconnected). All JSON here is camelCase, matching remote-ws/PROTOCOL.md.

/// Opaque remote-player handle, held on the Erlang side as a resource.
#[cfg(feature = "remote-player")]
struct RemotePlayerRes(rocksky_sdk::RemotePlayer);

#[cfg(feature = "remote-player")]
#[rustler::resource_impl]
impl Resource for RemotePlayerRes {}

/// Playback state accepted by `remote_player_set_now_playing`.
#[cfg(feature = "remote-player")]
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct NowPlayingJson {
    title: String,
    artist: String,
    album: String,
    album_artist: String,
    album_art: String,
    duration_ms: u64,
    elapsed_ms: u64,
    is_playing: bool,
    codec: Option<String>,
    sample_rate: Option<u32>,
}

#[cfg(feature = "remote-player")]
impl Default for NowPlayingJson {
    fn default() -> Self {
        Self {
            title: String::new(),
            artist: String::new(),
            album: String::new(),
            album_artist: String::new(),
            album_art: String::new(),
            duration_ms: 0,
            elapsed_ms: 0,
            is_playing: true,
            codec: None,
            sample_rate: None,
        }
    }
}

/// A queue entry accepted by `remote_player_set_queue`.
#[cfg(feature = "remote-player")]
#[derive(serde::Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct QueueItemJson {
    upload_id: String,
    track_id: String,
    title: String,
    artist: String,
    album: String,
    album_artist: String,
    album_art: String,
    duration_ms: u64,
    song_uri: String,
    album_uri: String,
    track_number: i32,
}

#[cfg(feature = "remote-player")]
fn queue_item_to_json(it: &rocksky_sdk::RemoteQueueItem) -> serde_json::Value {
    serde_json::json!({
        "uploadId": it.upload_id,
        "trackId": it.track_id,
        "title": it.title,
        "artist": it.artist,
        "album": it.album,
        "albumArtist": it.album_artist,
        "albumArt": it.album_art,
        "duration": it.duration_ms,
        "songUri": it.song_uri,
        "albumUri": it.album_uri,
        "trackNumber": it.track_number,
    })
}

#[cfg(feature = "remote-player")]
fn command_to_json(cmd: &rocksky_sdk::RemoteCommand) -> serde_json::Value {
    use rocksky_sdk::RemoteCommand as C;
    match cmd {
        C::Play => serde_json::json!({ "action": "play" }),
        C::Pause => serde_json::json!({ "action": "pause" }),
        C::Next => serde_json::json!({ "action": "next" }),
        C::Previous => serde_json::json!({ "action": "previous" }),
        C::Seek { position_ms } => serde_json::json!({ "action": "seek", "position": position_ms }),
        C::QueueJump { index } => serde_json::json!({ "action": "queue_jump", "index": index }),
        C::QueueRemove { index } => {
            serde_json::json!({ "action": "queue_remove", "index": index })
        }
        C::Enqueue {
            tracks,
            mode,
            shuffle,
            start_index,
        } => serde_json::json!({
            "action": "enqueue",
            "tracks": tracks.iter().map(queue_item_to_json).collect::<Vec<_>>(),
            "mode": mode,
            "shuffle": shuffle,
            "startIndex": start_index,
        }),
    }
}

/// Connect and register a controllable player in the background. `token` is a
/// Rocksky access token (JWT); `name` is the miniplayer device-picker label;
/// `url` may be empty for the public endpoint. Returns an opaque handle.
#[cfg(feature = "remote-player")]
#[rustler::nif(schedule = "DirtyIo")]
fn remote_player_connect(token: String, name: String, url: String) -> ResourceArc<RemotePlayerRes> {
    let mut cfg = rocksky_sdk::RemotePlayerConfig::new(token, name);
    if !url.is_empty() {
        cfg = cfg.url(url);
    }
    // `connect` spawns a background task with `tokio::spawn`, which needs an
    // active runtime context.
    let player = RT.block_on(async { rocksky_sdk::RemotePlayer::connect(cfg) });
    ResourceArc::new(RemotePlayerRes(player))
}

/// Block until the next controller command, returned as `{"ok": <cmd>}` where
/// `<cmd>` is a command object (`{"action":"…", …}`) or `null` once disconnected.
#[cfg(feature = "remote-player")]
#[rustler::nif(schedule = "DirtyIo")]
fn remote_player_next_command(player: ResourceArc<RemotePlayerRes>) -> String {
    match RT.block_on(player.0.next_command()) {
        Some(cmd) => envelope::<_, String>(Ok(command_to_json(&cmd))),
        None => envelope::<_, String>(Ok(serde_json::Value::Null)),
    }
}

/// Advertise the currently-playing track (`track_json` = camelCase now-playing).
#[cfg(feature = "remote-player")]
#[rustler::nif]
fn remote_player_set_now_playing(
    player: ResourceArc<RemotePlayerRes>,
    track_json: String,
) -> String {
    match parse::<NowPlayingJson>(&track_json) {
        Ok(t) => {
            player.0.set_now_playing(rocksky_sdk::RemoteNowPlaying {
                title: t.title,
                artist: t.artist,
                album: t.album,
                album_artist: t.album_artist,
                album_art: t.album_art,
                duration_ms: t.duration_ms,
                elapsed_ms: t.elapsed_ms,
                is_playing: t.is_playing,
                codec: t.codec,
                sample_rate: t.sample_rate,
            });
            envelope::<_, String>(Ok(true))
        }
        Err(e) => envelope::<(), _>(Err(e)),
    }
}

/// Advertise transport status: `"playing"`, `"paused"`, or `"stopped"`.
#[cfg(feature = "remote-player")]
#[rustler::nif]
fn remote_player_set_status(player: ResourceArc<RemotePlayerRes>, status: String) -> String {
    let status = match status.as_str() {
        "playing" => rocksky_sdk::RemoteStatus::Playing,
        "paused" => rocksky_sdk::RemoteStatus::Paused,
        "stopped" => rocksky_sdk::RemoteStatus::Stopped,
        other => {
            return envelope::<(), _>(Err(format!(
                "unknown status {other:?} (expected playing|paused|stopped)"
            )))
        }
    };
    player.0.set_status(status);
    envelope::<_, String>(Ok(true))
}

/// Advertise the current queue (`items_json` = JSON array of camelCase queue
/// items) and the active `index`.
#[cfg(feature = "remote-player")]
#[rustler::nif]
fn remote_player_set_queue(
    player: ResourceArc<RemotePlayerRes>,
    items_json: String,
    index: u32,
) -> String {
    match parse::<Vec<QueueItemJson>>(&items_json) {
        Ok(items) => {
            let items = items
                .into_iter()
                .map(|i| rocksky_sdk::RemoteQueueItem {
                    upload_id: i.upload_id,
                    track_id: i.track_id,
                    title: i.title,
                    artist: i.artist,
                    album: i.album,
                    album_artist: i.album_artist,
                    album_art: i.album_art,
                    duration_ms: i.duration_ms,
                    song_uri: i.song_uri,
                    album_uri: i.album_uri,
                    track_number: i.track_number,
                })
                .collect();
            player.0.set_queue(items, index);
            envelope::<_, String>(Ok(true))
        }
        Err(e) => envelope::<(), _>(Err(e)),
    }
}

/// Disconnect and stop the background task (the handle stays valid until dropped).
#[cfg(feature = "remote-player")]
#[rustler::nif]
fn remote_player_disconnect(player: ResourceArc<RemotePlayerRes>) -> String {
    player.0.disconnect();
    envelope::<_, String>(Ok(true))
}

// ---- remote controller (drive & observe the user's players) --------------
//
// An opaque resource over `rocksky_sdk::RemoteController`. Poll
// `remote_controller_next_event` in a loop (dirty IO); send commands /
// `set_primary` from anywhere. All JSON is camelCase.

/// Opaque remote-controller handle, held on the Erlang side as a resource.
#[cfg(feature = "remote-player")]
struct RemoteControllerRes(rocksky_sdk::RemoteController);

#[cfg(feature = "remote-player")]
#[rustler::resource_impl]
impl Resource for RemoteControllerRes {}

/// An empty target string means "broadcast to all devices".
#[cfg(feature = "remote-player")]
fn opt_target(s: String) -> Option<String> {
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

#[cfg(feature = "remote-player")]
fn now_playing_to_json(t: &rocksky_sdk::RemoteNowPlaying) -> serde_json::Value {
    serde_json::json!({
        "title": t.title,
        "artist": t.artist,
        "album": t.album,
        "albumArtist": t.album_artist,
        "albumArt": t.album_art,
        "durationMs": t.duration_ms,
        "elapsedMs": t.elapsed_ms,
        "isPlaying": t.is_playing,
        "codec": t.codec,
        "sampleRate": t.sample_rate,
    })
}

#[cfg(feature = "remote-player")]
fn status_str(s: &rocksky_sdk::RemoteStatus) -> &'static str {
    match s {
        rocksky_sdk::RemoteStatus::Playing => "playing",
        rocksky_sdk::RemoteStatus::Paused => "paused",
        rocksky_sdk::RemoteStatus::Stopped => "stopped",
    }
}

#[cfg(feature = "remote-player")]
fn device_to_json(d: &rocksky_sdk::RemoteDevice) -> serde_json::Value {
    serde_json::json!({
        "deviceId": d.device_id,
        "name": d.name,
        "nowPlaying": d.now_playing.as_ref().map(now_playing_to_json),
        "queueIndex": d.queue_index,
        "queue": d.queue.iter().map(queue_item_to_json).collect::<Vec<_>>(),
    })
}

#[cfg(feature = "remote-player")]
fn event_to_json(e: &rocksky_sdk::RemoteEvent) -> serde_json::Value {
    use rocksky_sdk::RemoteEvent as E;
    match e {
        E::Devices {
            primary_device,
            devices,
        } => serde_json::json!({
            "type": "devices",
            "primaryDevice": primary_device,
            "devices": devices.iter().map(device_to_json).collect::<Vec<_>>(),
        }),
        E::DeviceRegistered { device_id, name } => serde_json::json!({
            "type": "device_registered", "deviceId": device_id, "name": name,
        }),
        E::DeviceUnregistered { device_id } => serde_json::json!({
            "type": "device_unregistered", "deviceId": device_id,
        }),
        E::PrimaryChanged { device_id } => serde_json::json!({
            "type": "primary_changed", "deviceId": device_id,
        }),
        E::NowPlaying {
            device_id,
            device_name,
            track,
        } => serde_json::json!({
            "type": "now_playing",
            "deviceId": device_id,
            "deviceName": device_name,
            "track": now_playing_to_json(track),
        }),
        E::Status {
            device_id,
            device_name,
            status,
        } => serde_json::json!({
            "type": "status",
            "deviceId": device_id,
            "deviceName": device_name,
            "status": status_str(status),
        }),
        E::Queue {
            device_id,
            device_name,
            index,
            queue,
        } => serde_json::json!({
            "type": "queue",
            "deviceId": device_id,
            "deviceName": device_name,
            "index": index,
            "queue": queue.iter().map(queue_item_to_json).collect::<Vec<_>>(),
        }),
    }
}

/// Connect and register a controller in the background. Returns an opaque handle.
#[cfg(feature = "remote-player")]
#[rustler::nif(schedule = "DirtyIo")]
fn remote_controller_connect(
    token: String,
    name: String,
    url: String,
) -> ResourceArc<RemoteControllerRes> {
    let mut cfg = rocksky_sdk::RemoteControllerConfig::new(token, name);
    if !url.is_empty() {
        cfg = cfg.url(url);
    }
    let controller = RT.block_on(async { rocksky_sdk::RemoteController::connect(cfg) });
    ResourceArc::new(RemoteControllerRes(controller))
}

/// Block until the next update, returned as `{"ok": <event>}` where `<event>` is
/// an event object (`{"type":"…", …}`) or `null` once disconnected.
#[cfg(feature = "remote-player")]
#[rustler::nif(schedule = "DirtyIo")]
fn remote_controller_next_event(controller: ResourceArc<RemoteControllerRes>) -> String {
    match RT.block_on(controller.0.next_event()) {
        Some(ev) => envelope::<_, String>(Ok(event_to_json(&ev))),
        None => envelope::<_, String>(Ok(serde_json::Value::Null)),
    }
}

/// Choose the primary (scrobble/profile) device.
#[cfg(feature = "remote-player")]
#[rustler::nif]
fn remote_controller_set_primary(
    controller: ResourceArc<RemoteControllerRes>,
    device_id: String,
) -> String {
    controller.0.set_primary(device_id);
    envelope::<_, String>(Ok(true))
}

/// Send a simple command (`play` | `pause` | `next` | `previous`). Empty `target`
/// broadcasts to all the user's devices.
#[cfg(feature = "remote-player")]
#[rustler::nif]
fn remote_controller_command(
    controller: ResourceArc<RemoteControllerRes>,
    action: String,
    target: String,
) -> String {
    let target = opt_target(target);
    match action.as_str() {
        "play" => controller.0.play(target),
        "pause" => controller.0.pause(target),
        "next" => controller.0.next(target),
        "previous" => controller.0.previous(target),
        other => {
            return envelope::<(), _>(Err(format!(
                "unknown action {other:?} (expected play|pause|next|previous)"
            )))
        }
    }
    envelope::<_, String>(Ok(true))
}

/// Seek the target device to `position_ms` (empty `target` = broadcast).
#[cfg(feature = "remote-player")]
#[rustler::nif]
fn remote_controller_seek(
    controller: ResourceArc<RemoteControllerRes>,
    target: String,
    position_ms: u64,
) -> String {
    controller.0.seek(opt_target(target), position_ms);
    envelope::<_, String>(Ok(true))
}

/// Jump to `index` in the target device's queue (empty `target` = broadcast).
#[cfg(feature = "remote-player")]
#[rustler::nif]
fn remote_controller_queue_jump(
    controller: ResourceArc<RemoteControllerRes>,
    target: String,
    index: u32,
) -> String {
    controller.0.queue_jump(opt_target(target), index);
    envelope::<_, String>(Ok(true))
}

/// Remove queue item `index` on the target device (empty `target` = broadcast).
#[cfg(feature = "remote-player")]
#[rustler::nif]
fn remote_controller_queue_remove(
    controller: ResourceArc<RemoteControllerRes>,
    target: String,
    index: u32,
) -> String {
    controller.0.queue_remove(opt_target(target), index);
    envelope::<_, String>(Ok(true))
}

/// Enqueue tracks on the target device. `tracks_json` = JSON array of camelCase
/// queue items; `mode` = `"now"` | `"next"` | `"last"`; empty `target` = broadcast.
#[cfg(feature = "remote-player")]
#[rustler::nif]
fn remote_controller_enqueue(
    controller: ResourceArc<RemoteControllerRes>,
    target: String,
    tracks_json: String,
    mode: String,
    shuffle: bool,
    start_index: u32,
) -> String {
    match parse::<Vec<QueueItemJson>>(&tracks_json) {
        Ok(items) => {
            let items = items
                .into_iter()
                .map(|i| rocksky_sdk::RemoteQueueItem {
                    upload_id: i.upload_id,
                    track_id: i.track_id,
                    title: i.title,
                    artist: i.artist,
                    album: i.album,
                    album_artist: i.album_artist,
                    album_art: i.album_art,
                    duration_ms: i.duration_ms,
                    song_uri: i.song_uri,
                    album_uri: i.album_uri,
                    track_number: i.track_number,
                })
                .collect();
            controller
                .0
                .enqueue(opt_target(target), items, mode, shuffle, start_index);
            envelope::<_, String>(Ok(true))
        }
        Err(e) => envelope::<(), _>(Err(e)),
    }
}

/// Disconnect and stop the background task.
#[cfg(feature = "remote-player")]
#[rustler::nif]
fn remote_controller_disconnect(controller: ResourceArc<RemoteControllerRes>) -> String {
    controller.0.disconnect();
    envelope::<_, String>(Ok(true))
}

rustler::init!("rocksky_nif");
