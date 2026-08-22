//! A plain C ABI over `rocksky-sdk`, for C-FFI consumers (the fiddle-based Ruby
//! SDK; Clojure via the JVM Panama FFM API).
//!
//! Contract:
//! - All strings are UTF-8, NUL-terminated. Every `*mut c_char` this module
//!   returns is heap-owned and must be freed with [`rocksky_string_free`].
//! - Fallible calls return a JSON envelope string: `{"ok": <data>}` on success,
//!   `{"error": "<message>"}` on failure.
//! - The agent is an opaque handle (`*mut Agent`). [`rocksky_agent_login`]
//!   returns null on failure — call [`rocksky_last_error`] for the message —
//!   and the handle must be released with [`rocksky_agent_free`].

use std::cell::RefCell;
use std::ffi::{CStr, CString};
use std::os::raw::c_char;

use rocksky_sdk::{RockskyAgent, ScrobbleDraft, ScrobbleMatch};

use crate::RT;

thread_local! {
    static LAST_ERROR: RefCell<Option<CString>> = const { RefCell::new(None) };
}

fn set_last_error(msg: String) {
    LAST_ERROR.with(|e| *e.borrow_mut() = CString::new(msg).ok());
}

/// Read a borrowed C string into an owned `String` (empty on null / invalid).
fn cstr(p: *const c_char) -> String {
    if p.is_null() {
        return String::new();
    }
    unsafe { CStr::from_ptr(p).to_string_lossy().into_owned() }
}

fn to_c(s: String) -> *mut c_char {
    CString::new(s)
        .unwrap_or_else(|_| CString::new("").unwrap())
        .into_raw()
}

/// Wrap a result as a `{"ok"|"error"}` JSON envelope string.
fn respond<T: serde::Serialize>(r: Result<T, String>) -> *mut c_char {
    let value = match r {
        Ok(v) => serde_json::json!({ "ok": v }),
        Err(e) => serde_json::json!({ "error": e }),
    };
    to_c(value.to_string())
}

/// Free a string returned by any function in this module.
///
/// # Safety
/// `p` must be a pointer previously returned here (or null).
#[no_mangle]
pub unsafe extern "C" fn rocksky_string_free(p: *mut c_char) {
    if !p.is_null() {
        drop(CString::from_raw(p));
    }
}

/// The last error recorded on this thread (for null-returning calls), or null.
/// Caller frees with [`rocksky_string_free`].
#[no_mangle]
pub extern "C" fn rocksky_last_error() -> *mut c_char {
    LAST_ERROR
        .with(|e| e.borrow().clone())
        .map(CString::into_raw)
        .unwrap_or(std::ptr::null_mut())
}

// ---- reads (unauthenticated; base URL passed per call) -------------------

fn appview(base: *const c_char) -> rocksky_sdk::AppView {
    let base = cstr(base);
    if base.is_empty() {
        rocksky_sdk::AppView::new(rocksky_sdk::DEFAULT_APPVIEW)
    } else {
        rocksky_sdk::AppView::new(base)
    }
}

#[no_mangle]
pub extern "C" fn rocksky_profile(base: *const c_char, actor: *const c_char) -> *mut c_char {
    respond(
        RT.block_on(appview(base).profile(&cstr(actor)))
            .map_err(|e| e.to_string()),
    )
}

#[no_mangle]
pub extern "C" fn rocksky_scrobbles(
    base: *const c_char,
    actor: *const c_char,
    limit: u32,
    offset: u32,
) -> *mut c_char {
    respond(
        RT.block_on(appview(base).scrobbles(&cstr(actor), limit, offset))
            .map_err(|e| e.to_string()),
    )
}

#[no_mangle]
pub extern "C" fn rocksky_top_tracks(base: *const c_char, limit: u32, offset: u32) -> *mut c_char {
    respond(
        RT.block_on(appview(base).top_tracks(limit, offset))
            .map_err(|e| e.to_string()),
    )
}

#[no_mangle]
pub extern "C" fn rocksky_global_stats(base: *const c_char) -> *mut c_char {
    respond(
        RT.block_on(appview(base).global_stats())
            .map_err(|e| e.to_string()),
    )
}

/// Call any AppView read query by nsid. `params_json` is a JSON object of string
/// params (`{"did":"…","limit":"20"}`); empty/`null` means none. This is the
/// universal read escape hatch — every `app.rocksky.*` query is reachable here.
#[no_mangle]
pub extern "C" fn rocksky_get(
    base: *const c_char,
    nsid: *const c_char,
    params_json: *const c_char,
    token: *const c_char,
) -> *mut c_char {
    let mut av = appview(base);
    let t = cstr(token);
    if !t.is_empty() {
        av.set_token(Some(t));
    }
    respond(
        RT.block_on(av.get(&cstr(nsid), &json_params(&cstr(params_json))))
            .map_err(|e| e.to_string()),
    )
}

/// Build a token-enforced [`rocksky_sdk::Library`]. `token` must be non-empty —
/// every `app.rocksky.library.*` call is auth-gated.
fn library(base: *const c_char, token: *const c_char) -> Result<rocksky_sdk::Library, String> {
    let base = cstr(base);
    let base = if base.is_empty() {
        rocksky_sdk::DEFAULT_APPVIEW.to_string()
    } else {
        base
    };
    rocksky_sdk::Library::new(base, cstr(token)).map_err(|e| e.to_string())
}

/// Call any authenticated `app.rocksky.library.*` **query** by nsid. `token` is
/// required (empty → error). `params_json` is a JSON object of params.
#[no_mangle]
pub extern "C" fn rocksky_library_get(
    base: *const c_char,
    token: *const c_char,
    nsid: *const c_char,
    params_json: *const c_char,
) -> *mut c_char {
    match library(base, token) {
        Ok(lib) => respond(
            RT.block_on(lib.get(&cstr(nsid), json_params(&cstr(params_json))))
                .map_err(|e| e.to_string()),
        ),
        Err(e) => respond::<()>(Err(e)),
    }
}

/// Call any authenticated `app.rocksky.library.*` **procedure** by nsid. `token`
/// is required (empty → error). `body_json` is the JSON input object.
#[no_mangle]
pub extern "C" fn rocksky_library_post(
    base: *const c_char,
    token: *const c_char,
    nsid: *const c_char,
    body_json: *const c_char,
) -> *mut c_char {
    match library(base, token) {
        Ok(lib) => {
            let body: serde_json::Value =
                serde_json::from_str(&cstr(body_json)).unwrap_or(serde_json::Value::Null);
            respond(
                RT.block_on(lib.post(&cstr(nsid), body))
                    .map_err(|e| e.to_string()),
            )
        }
        Err(e) => respond::<()>(Err(e)),
    }
}

/// Mark notifications as viewed (`app.rocksky.notification.updateSeen`). `token`
/// is required (empty → error at the server). `ids_json` is a JSON array of
/// notification ids, or `[]`/empty to mark **all** as viewed. Returns the typed
/// `{ "unreadCount": <int> }` result as JSON.
#[no_mangle]
pub extern "C" fn rocksky_update_seen(
    base: *const c_char,
    token: *const c_char,
    ids_json: *const c_char,
) -> *mut c_char {
    let mut av = appview(base);
    let t = cstr(token);
    if !t.is_empty() {
        av.set_token(Some(t));
    }
    let ids: Vec<String> = serde_json::from_str(&cstr(ids_json)).unwrap_or_default();
    respond(RT.block_on(av.update_seen(&ids)).map_err(|e| e.to_string()))
}

/// Parse a JSON GIF embed (`app.rocksky.shout.defs#gif`) into a
/// [`rocksky_sdk::ShoutGif`]. Empty or invalid input yields `None`.
fn parse_gif(gif_json: *const c_char) -> Option<rocksky_sdk::ShoutGif> {
    let s = cstr(gif_json);
    if s.is_empty() {
        return None;
    }
    serde_json::from_str::<rocksky_sdk::ShoutGif>(&s).ok()
}

/// Parse a JSON object of params into string pairs, coercing scalar values
/// (numbers, bools) to their string form so callers can pass `{"limit": 20}`.
pub(crate) fn json_params(s: &str) -> Vec<(String, String)> {
    serde_json::from_str::<std::collections::HashMap<String, serde_json::Value>>(s)
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

/// Build a core `DateInterval` from a flat `(unit, n, start, end)` spec, so
/// window math lives in one place across every SDK.
fn interval_from(
    unit: &str,
    n: u32,
    start: &str,
    end: &str,
) -> Result<rocksky_sdk::DateInterval, String> {
    use rocksky_sdk::DateInterval as D;
    Ok(match unit {
        "" | "all" => D::AllTime,
        "days" => D::LastDays(n),
        "weeks" => D::LastWeeks(n),
        "months" => D::LastMonths(n),
        "years" => D::LastYears(n),
        "range" => D::Range {
            start: start
                .parse()
                .map_err(|e| format!("bad start datetime: {e}"))?,
            end: end.parse().map_err(|e| format!("bad end datetime: {e}"))?,
        },
        other => return Err(format!("unknown interval unit: {other}")),
    })
}

/// Top tracks chart over a typed window. `unit` is `all|days|weeks|months|years|
/// range`; `n` is the rolling count; `start`/`end` are RFC-3339 for `range`.
#[no_mangle]
pub extern "C" fn rocksky_top_tracks_interval(
    base: *const c_char,
    limit: u32,
    offset: u32,
    unit: *const c_char,
    n: u32,
    start: *const c_char,
    end: *const c_char,
) -> *mut c_char {
    match interval_from(&cstr(unit), n, &cstr(start), &cstr(end)) {
        Ok(iv) => respond(
            RT.block_on(appview(base).top_tracks_interval(limit, offset, iv))
                .map_err(|e| e.to_string()),
        ),
        Err(e) => respond::<()>(Err(e)),
    }
}

/// Top artists chart over a typed window (see [`rocksky_top_tracks_interval`]).
#[no_mangle]
pub extern "C" fn rocksky_top_artists_interval(
    base: *const c_char,
    limit: u32,
    offset: u32,
    unit: *const c_char,
    n: u32,
    start: *const c_char,
    end: *const c_char,
) -> *mut c_char {
    match interval_from(&cstr(unit), n, &cstr(start), &cstr(end)) {
        Ok(iv) => respond(
            RT.block_on(appview(base).top_artists_interval(limit, offset, iv))
                .map_err(|e| e.to_string()),
        ),
        Err(e) => respond::<()>(Err(e)),
    }
}

/// Resolve full canonical metadata for a bare title + artist
/// (`app.rocksky.song.matchSong`). Empty `mb_id`/`isrc` mean none.
#[no_mangle]
pub extern "C" fn rocksky_match_song(
    base: *const c_char,
    title: *const c_char,
    artist: *const c_char,
    mb_id: *const c_char,
    isrc: *const c_char,
) -> *mut c_char {
    let (mb, is) = (cstr(mb_id), cstr(isrc));
    let mb = if mb.is_empty() {
        None
    } else {
        Some(mb.as_str())
    };
    let is = if is.is_empty() {
        None
    } else {
        Some(is.as_str())
    };
    respond(
        RT.block_on(appview(base).match_song(&cstr(title), &cstr(artist), mb, is))
            .map_err(|e| e.to_string()),
    )
}

// ---- identity hashes -----------------------------------------------------

#[no_mangle]
pub extern "C" fn rocksky_song_hash(
    title: *const c_char,
    artist: *const c_char,
    album: *const c_char,
) -> *mut c_char {
    to_c(rocksky_sdk::dedup::song_hash(
        &cstr(title),
        &cstr(artist),
        &cstr(album),
    ))
}

// ---- authenticated agent (opaque handle) ---------------------------------

/// Opaque agent handle.
pub struct Agent(RockskyAgent);

/// Log in with an app password. Returns null on failure ([`rocksky_last_error`]).
/// `dedup_path`, when non-empty, enables the local dedup index (needed for
/// [`rocksky_agent_sync_repo`] / [`rocksky_agent_hydrate_from_jetstream`]).
#[no_mangle]
pub extern "C" fn rocksky_agent_login(
    session_path: *const c_char,
    identifier: *const c_char,
    password: *const c_char,
    appview: *const c_char,
    dedup_path: *const c_char,
) -> *mut Agent {
    let mut builder = RockskyAgent::builder().session_store(cstr(session_path));
    let base = cstr(appview);
    if !base.is_empty() {
        builder = builder.appview(base);
    }
    #[cfg(feature = "dedup")]
    {
        let dedup = cstr(dedup_path);
        if !dedup.is_empty() {
            builder = builder.dedup_store(dedup);
        }
    }
    #[cfg(not(feature = "dedup"))]
    let _ = dedup_path;
    let agent = match builder.build() {
        Ok(a) => a,
        Err(e) => {
            set_last_error(e.to_string());
            return std::ptr::null_mut();
        }
    };
    match RT.block_on(agent.login_password(&cstr(identifier), &cstr(password))) {
        Ok(_) => Box::into_raw(Box::new(Agent(agent))),
        Err(e) => {
            set_last_error(e.to_string());
            std::ptr::null_mut()
        }
    }
}

/// Release an agent handle.
///
/// # Safety
/// `p` must be a handle from [`rocksky_agent_login`] (or null), freed once.
#[no_mangle]
pub unsafe extern "C" fn rocksky_agent_free(p: *mut Agent) {
    if !p.is_null() {
        drop(Box::from_raw(p));
    }
}

/// # Safety
/// `agent` must be a live handle from [`rocksky_agent_login`].
unsafe fn with_agent<'a>(agent: *mut Agent) -> &'a RockskyAgent {
    &(*agent).0
}

/// Scrobble a play. `scrobble_json` is a `ScrobbleDraft` (camelCase). Returns the
/// four record URIs.
///
/// # Safety
/// `agent` must be a live handle; `scrobble_json` a valid C string.
#[no_mangle]
pub unsafe extern "C" fn rocksky_agent_scrobble(
    agent: *mut Agent,
    scrobble_json: *const c_char,
) -> *mut c_char {
    let a = with_agent(agent);
    match serde_json::from_str::<ScrobbleDraft>(&cstr(scrobble_json)) {
        Ok(d) => respond(RT.block_on(a.scrobble(&d)).map_err(|e| e.to_string())),
        Err(e) => respond::<()>(Err(e.to_string())),
    }
}

/// Scrobble from a bare title + artist (empty `album` means none): resolve full
/// metadata via matchSong, then fan out.
///
/// # Safety
/// `agent` must be a live handle from [`rocksky_agent_login`].
#[no_mangle]
pub unsafe extern "C" fn rocksky_agent_scrobble_match(
    agent: *mut Agent,
    input_json: *const c_char,
) -> *mut c_char {
    let a = with_agent(agent);
    match serde_json::from_str::<ScrobbleMatch>(&cstr(input_json)) {
        Ok(m) => respond(RT.block_on(a.scrobble_match(&m)).map_err(|e| e.to_string())),
        Err(e) => respond::<()>(Err(e.to_string())),
    }
}

/// Download the caller's repo and (re)build the local dedup index; returns the
/// per-collection counts as JSON. Requires a `dedup_path` at login.
///
/// # Safety
/// `agent` must be a live handle from [`rocksky_agent_login`].
#[cfg(feature = "dedup")]
#[no_mangle]
pub unsafe extern "C" fn rocksky_agent_sync_repo(agent: *mut Agent) -> *mut c_char {
    let a = with_agent(agent);
    match RT.block_on(a.sync_repo()) {
        Ok(s) => respond(Ok(serde_json::json!({
            "artists": s.artists,
            "albums": s.albums,
            "songs": s.songs,
            "scrobbles": s.scrobbles,
            "total": s.total(),
        }))),
        Err(e) => respond::<()>(Err(e.to_string())),
    }
}

/// Keep the local dedup index hydrated from Jetstream in the background and
/// return immediately (`{"ok": true}`). Runs for the life of the process.
///
/// # Safety
/// `agent` must be a live handle from [`rocksky_agent_login`].
#[cfg(feature = "jetstream")]
#[no_mangle]
pub unsafe extern "C" fn rocksky_agent_hydrate_from_jetstream(agent: *mut Agent) -> *mut c_char {
    let a = (*agent).0.clone();
    RT.spawn(async move {
        let _ = a.hydrate_from_jetstream().await;
    });
    respond(Ok(true))
}

/// # Safety
/// `agent` must be a live handle; the string args valid C strings.
#[no_mangle]
pub unsafe extern "C" fn rocksky_agent_like(
    agent: *mut Agent,
    uri: *const c_char,
    cid: *const c_char,
) -> *mut c_char {
    let a = with_agent(agent);
    respond(
        RT.block_on(a.like(&cstr(uri), &cstr(cid)))
            .map_err(|e| e.to_string()),
    )
}

/// # Safety
/// `agent` must be a live handle; `did` a valid C string.
#[no_mangle]
pub unsafe extern "C" fn rocksky_agent_follow(
    agent: *mut Agent,
    did: *const c_char,
) -> *mut c_char {
    let a = with_agent(agent);
    respond(RT.block_on(a.follow(&cstr(did))).map_err(|e| e.to_string()))
}

/// # Safety
/// `agent` must be a live handle; the string args valid C strings.
#[no_mangle]
pub unsafe extern "C" fn rocksky_agent_shout(
    agent: *mut Agent,
    subject_uri: *const c_char,
    subject_cid: *const c_char,
    message: *const c_char,
) -> *mut c_char {
    let a = with_agent(agent);
    respond(
        RT.block_on(a.shout(&cstr(subject_uri), &cstr(subject_cid), &cstr(message)))
            .map_err(|e| e.to_string()),
    )
}

/// Post a shout with an optional GIF/sticker/clip. `message` may be empty when a
/// `gif_json` embed is supplied (pass at least one). `gif_json` is a JSON GIF
/// embed or empty for none. Returns the shout URI.
///
/// # Safety
/// `agent` must be a live handle; the string args valid C strings.
#[no_mangle]
pub unsafe extern "C" fn rocksky_agent_shout_with_gif(
    agent: *mut Agent,
    subject_uri: *const c_char,
    subject_cid: *const c_char,
    message: *const c_char,
    gif_json: *const c_char,
) -> *mut c_char {
    let a = with_agent(agent);
    let msg = cstr(message);
    let message = if msg.is_empty() { None } else { Some(msg) };
    let gif = parse_gif(gif_json);
    respond(
        RT.block_on(a.shout_with_gif(
            &cstr(subject_uri),
            &cstr(subject_cid),
            message.as_deref(),
            gif,
        ))
        .map_err(|e| e.to_string()),
    )
}

/// Reply to a shout with an optional GIF/sticker/clip. Semantics match
/// [`rocksky_agent_shout_with_gif`], plus a `parent` strong-ref. Returns the
/// shout URI.
///
/// # Safety
/// `agent` must be a live handle; the string args valid C strings.
#[no_mangle]
pub unsafe extern "C" fn rocksky_agent_reply_shout_with_gif(
    agent: *mut Agent,
    subject_uri: *const c_char,
    subject_cid: *const c_char,
    parent_uri: *const c_char,
    parent_cid: *const c_char,
    message: *const c_char,
    gif_json: *const c_char,
) -> *mut c_char {
    let a = with_agent(agent);
    let msg = cstr(message);
    let message = if msg.is_empty() { None } else { Some(msg) };
    let gif = parse_gif(gif_json);
    respond(
        RT.block_on(a.reply_shout_with_gif(
            &cstr(subject_uri),
            &cstr(subject_cid),
            &cstr(parent_uri),
            &cstr(parent_cid),
            message.as_deref(),
            gif,
        ))
        .map_err(|e| e.to_string()),
    )
}

/// # Safety
/// `agent` must be a live handle.
#[no_mangle]
pub unsafe extern "C" fn rocksky_agent_refresh_session(agent: *mut Agent) -> *mut c_char {
    let a = with_agent(agent);
    respond(
        RT.block_on(a.refresh_session())
            .map(|_| true)
            .map_err(|e| e.to_string()),
    )
}

// ---- remote player (Rocksky-controllable player over the WebSocket) ------
//
// An opaque handle over `rocksky_sdk::RemotePlayer`. The player registers and
// runs in the background; host languages poll `next_command` in a loop on a
// dedicated thread (it blocks until a command arrives, or returns `null` once
// disconnected). All JSON here is camelCase, matching remote-ws/PROTOCOL.md.

/// Playback state accepted by [`rocksky_remote_player_set_now_playing`].
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

/// A queue entry accepted by [`rocksky_remote_player_set_queue`].
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

/// An opaque remote-player handle.
#[cfg(feature = "remote-player")]
pub struct RemotePlayerHandle(rocksky_sdk::RemotePlayer);

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
/// `url` may be empty for the public endpoint. Release with
/// [`rocksky_remote_player_free`].
///
/// # Safety
/// The string args must be valid C strings (or null).
#[cfg(feature = "remote-player")]
#[no_mangle]
pub unsafe extern "C" fn rocksky_remote_player_connect(
    token: *const c_char,
    name: *const c_char,
    url: *const c_char,
) -> *mut RemotePlayerHandle {
    let mut cfg = rocksky_sdk::RemotePlayerConfig::new(cstr(token), cstr(name));
    let u = cstr(url);
    if !u.is_empty() {
        cfg = cfg.url(u);
    }
    // `connect` spawns a background task with `tokio::spawn`, which needs an
    // active runtime context.
    let player = RT.block_on(async { rocksky_sdk::RemotePlayer::connect(cfg) });
    Box::into_raw(Box::new(RemotePlayerHandle(player)))
}

/// Block until the next controller command, returned as `{"ok": <cmd>}` where
/// `<cmd>` is a command object (`{"action":"…", …}`) or `null` once
/// disconnected. Caller frees with [`rocksky_string_free`].
///
/// # Safety
/// `handle` must be a live handle from [`rocksky_remote_player_connect`].
#[cfg(feature = "remote-player")]
#[no_mangle]
pub unsafe extern "C" fn rocksky_remote_player_next_command(
    handle: *mut RemotePlayerHandle,
) -> *mut c_char {
    if handle.is_null() {
        return respond::<()>(Err("null handle".into()));
    }
    let p = &(*handle).0;
    match RT.block_on(p.next_command()) {
        Some(cmd) => respond(Ok(command_to_json(&cmd))),
        None => respond(Ok(serde_json::Value::Null)),
    }
}

/// Advertise the currently-playing track. `track_json` is a camelCase now-playing
/// object (`title`, `artist`, `album`, `albumArtist`, `albumArt`, `durationMs`,
/// `elapsedMs`, `isPlaying`, and optionally `codec`, `sampleRate`).
///
/// # Safety
/// `handle` must be live; `track_json` a valid C string.
#[cfg(feature = "remote-player")]
#[no_mangle]
pub unsafe extern "C" fn rocksky_remote_player_set_now_playing(
    handle: *mut RemotePlayerHandle,
    track_json: *const c_char,
) -> *mut c_char {
    if handle.is_null() {
        return respond::<()>(Err("null handle".into()));
    }
    let p = &(*handle).0;
    match serde_json::from_str::<NowPlayingJson>(&cstr(track_json)) {
        Ok(t) => {
            p.set_now_playing(rocksky_sdk::RemoteNowPlaying {
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
            respond(Ok(true))
        }
        Err(e) => respond::<()>(Err(e.to_string())),
    }
}

/// Advertise transport status: `"playing"`, `"paused"`, or `"stopped"`.
///
/// # Safety
/// `handle` must be live; `status` a valid C string.
#[cfg(feature = "remote-player")]
#[no_mangle]
pub unsafe extern "C" fn rocksky_remote_player_set_status(
    handle: *mut RemotePlayerHandle,
    status: *const c_char,
) -> *mut c_char {
    if handle.is_null() {
        return respond::<()>(Err("null handle".into()));
    }
    let p = &(*handle).0;
    let status = match cstr(status).as_str() {
        "playing" => rocksky_sdk::RemoteStatus::Playing,
        "paused" => rocksky_sdk::RemoteStatus::Paused,
        "stopped" => rocksky_sdk::RemoteStatus::Stopped,
        other => {
            return respond::<()>(Err(format!(
                "unknown status {other:?} (expected playing|paused|stopped)"
            )))
        }
    };
    p.set_status(status);
    respond(Ok(true))
}

/// Advertise the current queue (`items_json` = JSON array of camelCase queue
/// items) and the active `index`.
///
/// # Safety
/// `handle` must be live; `items_json` a valid C string.
#[cfg(feature = "remote-player")]
#[no_mangle]
pub unsafe extern "C" fn rocksky_remote_player_set_queue(
    handle: *mut RemotePlayerHandle,
    items_json: *const c_char,
    index: u32,
) -> *mut c_char {
    if handle.is_null() {
        return respond::<()>(Err("null handle".into()));
    }
    let p = &(*handle).0;
    match serde_json::from_str::<Vec<QueueItemJson>>(&cstr(items_json)) {
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
            p.set_queue(items, index);
            respond(Ok(true))
        }
        Err(e) => respond::<()>(Err(e.to_string())),
    }
}

/// Disconnect and stop the background task (the handle stays valid until freed).
///
/// # Safety
/// `handle` must be a live handle (or null).
#[cfg(feature = "remote-player")]
#[no_mangle]
pub unsafe extern "C" fn rocksky_remote_player_disconnect(
    handle: *mut RemotePlayerHandle,
) -> *mut c_char {
    if !handle.is_null() {
        (*handle).0.disconnect();
    }
    respond(Ok(true))
}

/// Release a remote-player handle.
///
/// # Safety
/// `p` must be a handle from [`rocksky_remote_player_connect`] (or null), freed once.
#[cfg(feature = "remote-player")]
#[no_mangle]
pub unsafe extern "C" fn rocksky_remote_player_free(p: *mut RemotePlayerHandle) {
    if !p.is_null() {
        drop(Box::from_raw(p));
    }
}

// ---- remote controller (drive & observe the user's players) --------------
//
// An opaque handle over `rocksky_sdk::RemoteController`. Poll
// `rocksky_remote_controller_next_event` in a loop on a dedicated thread; send
// commands / `set_primary` from anywhere. All JSON is camelCase.

/// An opaque remote-controller handle.
#[cfg(feature = "remote-player")]
pub struct RemoteControllerHandle(rocksky_sdk::RemoteController);

/// An empty target string means "broadcast to all devices".
#[cfg(feature = "remote-player")]
fn opt_target(p: *const c_char) -> Option<String> {
    let s = cstr(p);
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

/// Connect and register a controller in the background. Returns an opaque handle
/// (release with [`rocksky_remote_controller_free`]).
///
/// # Safety
/// The string args must be valid C strings (or null).
#[cfg(feature = "remote-player")]
#[no_mangle]
pub unsafe extern "C" fn rocksky_remote_controller_connect(
    token: *const c_char,
    name: *const c_char,
    url: *const c_char,
) -> *mut RemoteControllerHandle {
    let mut cfg = rocksky_sdk::RemoteControllerConfig::new(cstr(token), cstr(name));
    let u = cstr(url);
    if !u.is_empty() {
        cfg = cfg.url(u);
    }
    let controller = RT.block_on(async { rocksky_sdk::RemoteController::connect(cfg) });
    Box::into_raw(Box::new(RemoteControllerHandle(controller)))
}

/// Block until the next update, returned as `{"ok": <event>}` where `<event>` is
/// an event object (`{"type":"…", …}`) or `null` once disconnected. Caller frees
/// with [`rocksky_string_free`].
///
/// # Safety
/// `handle` must be a live handle from [`rocksky_remote_controller_connect`].
#[cfg(feature = "remote-player")]
#[no_mangle]
pub unsafe extern "C" fn rocksky_remote_controller_next_event(
    handle: *mut RemoteControllerHandle,
) -> *mut c_char {
    if handle.is_null() {
        return respond::<()>(Err("null handle".into()));
    }
    let c = &(*handle).0;
    match RT.block_on(c.next_event()) {
        Some(ev) => respond(Ok(event_to_json(&ev))),
        None => respond(Ok(serde_json::Value::Null)),
    }
}

/// Choose the primary (scrobble/profile) device.
///
/// # Safety
/// `handle` must be live; `device_id` a valid C string.
#[cfg(feature = "remote-player")]
#[no_mangle]
pub unsafe extern "C" fn rocksky_remote_controller_set_primary(
    handle: *mut RemoteControllerHandle,
    device_id: *const c_char,
) -> *mut c_char {
    if handle.is_null() {
        return respond::<()>(Err("null handle".into()));
    }
    (*handle).0.set_primary(cstr(device_id));
    respond(Ok(true))
}

/// Send a simple command (`play` | `pause` | `next` | `previous`). `target` may
/// be empty to broadcast to all the user's devices.
///
/// # Safety
/// `handle` must be live; `action` and `target` valid C strings.
#[cfg(feature = "remote-player")]
#[no_mangle]
pub unsafe extern "C" fn rocksky_remote_controller_command(
    handle: *mut RemoteControllerHandle,
    action: *const c_char,
    target: *const c_char,
) -> *mut c_char {
    if handle.is_null() {
        return respond::<()>(Err("null handle".into()));
    }
    let c = &(*handle).0;
    let target = opt_target(target);
    match cstr(action).as_str() {
        "play" => c.play(target),
        "pause" => c.pause(target),
        "next" => c.next(target),
        "previous" => c.previous(target),
        other => {
            return respond::<()>(Err(format!(
                "unknown action {other:?} (expected play|pause|next|previous)"
            )))
        }
    }
    respond(Ok(true))
}

/// Seek the target device to `position_ms` (empty `target` = broadcast).
///
/// # Safety
/// `handle` must be live; `target` a valid C string.
#[cfg(feature = "remote-player")]
#[no_mangle]
pub unsafe extern "C" fn rocksky_remote_controller_seek(
    handle: *mut RemoteControllerHandle,
    target: *const c_char,
    position_ms: u64,
) -> *mut c_char {
    if handle.is_null() {
        return respond::<()>(Err("null handle".into()));
    }
    (*handle).0.seek(opt_target(target), position_ms);
    respond(Ok(true))
}

/// Jump to `index` in the target device's queue (empty `target` = broadcast).
///
/// # Safety
/// `handle` must be live; `target` a valid C string.
#[cfg(feature = "remote-player")]
#[no_mangle]
pub unsafe extern "C" fn rocksky_remote_controller_queue_jump(
    handle: *mut RemoteControllerHandle,
    target: *const c_char,
    index: u32,
) -> *mut c_char {
    if handle.is_null() {
        return respond::<()>(Err("null handle".into()));
    }
    (*handle).0.queue_jump(opt_target(target), index);
    respond(Ok(true))
}

/// Remove queue item `index` on the target device (empty `target` = broadcast).
///
/// # Safety
/// `handle` must be live; `target` a valid C string.
#[cfg(feature = "remote-player")]
#[no_mangle]
pub unsafe extern "C" fn rocksky_remote_controller_queue_remove(
    handle: *mut RemoteControllerHandle,
    target: *const c_char,
    index: u32,
) -> *mut c_char {
    if handle.is_null() {
        return respond::<()>(Err("null handle".into()));
    }
    (*handle).0.queue_remove(opt_target(target), index);
    respond(Ok(true))
}

/// Enqueue tracks on the target device. `tracks_json` is a JSON array of camelCase
/// queue items; `mode` is `"now"` | `"next"` | `"last"`; empty `target` = broadcast.
///
/// # Safety
/// `handle` must be live; `target`, `tracks_json`, `mode` valid C strings.
#[cfg(feature = "remote-player")]
#[no_mangle]
pub unsafe extern "C" fn rocksky_remote_controller_enqueue(
    handle: *mut RemoteControllerHandle,
    target: *const c_char,
    tracks_json: *const c_char,
    mode: *const c_char,
    shuffle: bool,
    start_index: u32,
) -> *mut c_char {
    if handle.is_null() {
        return respond::<()>(Err("null handle".into()));
    }
    let c = &(*handle).0;
    match serde_json::from_str::<Vec<QueueItemJson>>(&cstr(tracks_json)) {
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
            c.enqueue(opt_target(target), items, cstr(mode), shuffle, start_index);
            respond(Ok(true))
        }
        Err(e) => respond::<()>(Err(e.to_string())),
    }
}

/// Disconnect and stop the background task (the handle stays valid until freed).
///
/// # Safety
/// `handle` must be a live handle (or null).
#[cfg(feature = "remote-player")]
#[no_mangle]
pub unsafe extern "C" fn rocksky_remote_controller_disconnect(
    handle: *mut RemoteControllerHandle,
) -> *mut c_char {
    if !handle.is_null() {
        (*handle).0.disconnect();
    }
    respond(Ok(true))
}

/// Release a remote-controller handle.
///
/// # Safety
/// `p` must be a handle from [`rocksky_remote_controller_connect`] (or null), freed once.
#[cfg(feature = "remote-player")]
#[no_mangle]
pub unsafe extern "C" fn rocksky_remote_controller_free(p: *mut RemoteControllerHandle) {
    if !p.is_null() {
        drop(Box::from_raw(p));
    }
}
