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

use rocksky_sdk::{RockskyAgent, ScrobbleDraft};

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
) -> *mut c_char {
    let params: Vec<(String, String)> =
        serde_json::from_str::<std::collections::HashMap<String, String>>(&cstr(params_json))
            .map(|m| m.into_iter().collect())
            .unwrap_or_default();
    respond(
        RT.block_on(appview(base).get(&cstr(nsid), &params))
            .map_err(|e| e.to_string()),
    )
}

/// Build a core `DateInterval` from a flat `(unit, n, start, end)` spec, so
/// window math lives in one place across every SDK.
fn interval_from(unit: &str, n: u32, start: &str, end: &str) -> Result<rocksky_sdk::DateInterval, String> {
    use rocksky_sdk::DateInterval as D;
    Ok(match unit {
        "" | "all" => D::AllTime,
        "days" => D::LastDays(n),
        "weeks" => D::LastWeeks(n),
        "months" => D::LastMonths(n),
        "years" => D::LastYears(n),
        "range" => D::Range {
            start: start.parse().map_err(|e| format!("bad start datetime: {e}"))?,
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
#[no_mangle]
pub extern "C" fn rocksky_agent_login(
    session_path: *const c_char,
    identifier: *const c_char,
    password: *const c_char,
    appview: *const c_char,
) -> *mut Agent {
    let mut builder = RockskyAgent::builder().session_store(cstr(session_path));
    let base = cstr(appview);
    if !base.is_empty() {
        builder = builder.appview(base);
    }
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
