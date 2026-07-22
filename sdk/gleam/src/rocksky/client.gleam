//// Rocksky SDK for Gleam.
////
//// Typed externals over the `rocksky_erl` NIF package (the shared Rust core,
//// `rocksky-sdk`): AppView reads, record writes (scrobble, like, follow,
//// shout), and the identity hashes shared across every Rocksky SDK.
////
//// Reads use the default AppView (`https://api.rocksky.app`); the `*_at`
//// variants take a custom base URL. Envelope calls return `Dynamic` — an
//// `{ok, value}` / `{error, message}` tuple with binary-keyed maps (the wire
//// shape); decode with `gleam/dynamic`.

import gleam/dynamic.{type Dynamic}

/// An opaque authenticated-agent handle (a NIF resource freed by the BEAM GC).
pub type Agent =
  Dynamic

/// The default AppView base URL used by the no-argument read functions.
pub const default_endpoint = "https://api.rocksky.app"

// ---- reads (unauthenticated) --------------------------------------------
//
// Each read has a default variant (no base URL) and an `*_at` variant that
// targets a custom AppView endpoint.

@external(erlang, "rocksky", "profile")
fn profile_ffi(actor: String, base: String) -> Dynamic

/// An actor's detailed profile.
pub fn profile(actor: String) -> Dynamic {
  profile_ffi(actor, "")
}

/// [profile](#profile) against a custom AppView endpoint.
pub fn profile_at(actor: String, endpoint: String) -> Dynamic {
  profile_ffi(actor, endpoint)
}

@external(erlang, "rocksky", "scrobbles")
fn scrobbles_ffi(actor: String, limit: Int, offset: Int, base: String) -> Dynamic

/// An actor's scrobbles, newest first.
pub fn scrobbles(actor: String, limit: Int, offset: Int) -> Dynamic {
  scrobbles_ffi(actor, limit, offset, "")
}

/// [scrobbles](#scrobbles) against a custom AppView endpoint.
pub fn scrobbles_at(actor: String, limit: Int, offset: Int, endpoint: String) -> Dynamic {
  scrobbles_ffi(actor, limit, offset, endpoint)
}

@external(erlang, "rocksky", "top_tracks")
fn top_tracks_ffi(limit: Int, offset: Int, base: String) -> Dynamic

/// Platform-wide top tracks chart.
pub fn top_tracks(limit: Int, offset: Int) -> Dynamic {
  top_tracks_ffi(limit, offset, "")
}

/// [top_tracks](#top_tracks) against a custom AppView endpoint.
pub fn top_tracks_at(limit: Int, offset: Int, endpoint: String) -> Dynamic {
  top_tracks_ffi(limit, offset, endpoint)
}

@external(erlang, "rocksky", "global_stats")
fn global_stats_ffi(base: String) -> Dynamic

/// Platform-wide totals.
pub fn global_stats() -> Dynamic {
  global_stats_ffi("")
}

/// [global_stats](#global_stats) against a custom AppView endpoint.
pub fn global_stats_at(endpoint: String) -> Dynamic {
  global_stats_ffi(endpoint)
}

// ---- universal read + typed date windows --------------------------------

@external(erlang, "rocksky", "get_raw")
fn get_ffi(base: String, nsid: String, params_json: String, token: String) -> Dynamic

/// Call any `app.rocksky.*` read query by nsid. `params_json` is a JSON object
/// of string params (`"{\"uri\":\"at://…\"}"`) — the whole read-query catalog is
/// reachable here.
pub fn get(nsid: String, params_json: String) -> Dynamic {
  get_ffi("", nsid, params_json, "")
}

/// [get](#get) with a bearer access token (for auth-gated queries).
pub fn get_authed(nsid: String, params_json: String, token: String) -> Dynamic {
  get_ffi("", nsid, params_json, token)
}

/// [get](#get) against a custom AppView endpoint.
pub fn get_at(nsid: String, params_json: String, endpoint: String) -> Dynamic {
  get_ffi(endpoint, nsid, params_json, "")
}

@external(erlang, "rocksky", "match_song")
fn match_song_ffi(title: String, artist: String) -> Dynamic

/// Resolve full canonical metadata for a bare title + artist (matchSong).
pub fn match_song(title: String, artist: String) -> Dynamic {
  match_song_ffi(title, artist)
}

/// A typed date window for the `top_*_interval` charts.
pub type Interval {
  AllTime
  LastDays(Int)
  LastWeeks(Int)
  LastMonths(Int)
  LastYears(Int)
  Range(start: String, end: String)
}

fn interval_parts(iv: Interval) -> #(String, Int, String, String) {
  case iv {
    AllTime -> #("all", 0, "", "")
    LastDays(n) -> #("days", n, "", "")
    LastWeeks(n) -> #("weeks", n, "", "")
    LastMonths(n) -> #("months", n, "", "")
    LastYears(n) -> #("years", n, "", "")
    Range(s, e) -> #("range", 0, s, e)
  }
}

@external(erlang, "rocksky", "top_tracks_interval_raw")
fn top_tracks_interval_ffi(
  base: String,
  limit: Int,
  offset: Int,
  unit: String,
  n: Int,
  start: String,
  end: String,
) -> Dynamic

/// Platform-wide top tracks chart over a typed [Interval](#Interval).
pub fn top_tracks_interval(limit: Int, offset: Int, interval: Interval) -> Dynamic {
  let #(u, n, s, e) = interval_parts(interval)
  top_tracks_interval_ffi("", limit, offset, u, n, s, e)
}

/// [top_tracks_interval](#top_tracks_interval) against a custom AppView endpoint.
pub fn top_tracks_interval_at(
  limit: Int,
  offset: Int,
  interval: Interval,
  endpoint: String,
) -> Dynamic {
  let #(u, n, s, e) = interval_parts(interval)
  top_tracks_interval_ffi(endpoint, limit, offset, u, n, s, e)
}

@external(erlang, "rocksky", "top_artists_interval_raw")
fn top_artists_interval_ffi(
  base: String,
  limit: Int,
  offset: Int,
  unit: String,
  n: Int,
  start: String,
  end: String,
) -> Dynamic

/// Platform-wide top artists chart over a typed [Interval](#Interval).
pub fn top_artists_interval(limit: Int, offset: Int, interval: Interval) -> Dynamic {
  let #(u, n, s, e) = interval_parts(interval)
  top_artists_interval_ffi("", limit, offset, u, n, s, e)
}

/// [top_artists_interval](#top_artists_interval) against a custom AppView endpoint.
pub fn top_artists_interval_at(
  limit: Int,
  offset: Int,
  interval: Interval,
  endpoint: String,
) -> Dynamic {
  let #(u, n, s, e) = interval_parts(interval)
  top_artists_interval_ffi(endpoint, limit, offset, u, n, s, e)
}

// ---- identity hashes (pure) ---------------------------------------------

@external(erlang, "rocksky", "song_hash")
fn song_hash_ffi(title: String, artist: String, album: String) -> String

/// Identity hash of a song — identical across every Rocksky SDK.
pub fn song_hash(title: String, artist: String, album: String) -> String {
  song_hash_ffi(title, artist, album)
}

@external(erlang, "rocksky", "artist_hash")
fn artist_hash_ffi(album_artist: String) -> String

/// Identity hash of an artist.
pub fn artist_hash(album_artist: String) -> String {
  artist_hash_ffi(album_artist)
}

// ---- authenticated agent -------------------------------------------------

@external(erlang, "rocksky", "agent_login")
fn agent_login_ffi(
  session: String,
  identifier: String,
  password: String,
  appview: String,
) -> Agent

/// Log in with an app password, persisting the session at `session_path`.
pub fn login(session_path: String, identifier: String, password: String) -> Agent {
  agent_login_ffi(session_path, identifier, password, "")
}

@external(erlang, "rocksky", "agent_like")
fn agent_like_ffi(agent: Agent, uri: String, cid: String) -> Dynamic

/// Like a record by strong reference.
pub fn like(agent: Agent, uri: String, cid: String) -> Dynamic {
  agent_like_ffi(agent, uri, cid)
}

@external(erlang, "rocksky", "agent_follow")
fn agent_follow_ffi(agent: Agent, did: String) -> Dynamic

/// Follow an account by DID.
pub fn follow(agent: Agent, did: String) -> Dynamic {
  agent_follow_ffi(agent, did)
}

@external(erlang, "rocksky", "agent_shout")
fn agent_shout_ffi(
  agent: Agent,
  subject_uri: String,
  subject_cid: String,
  message: String,
) -> Dynamic

/// Post a shout on a subject.
pub fn shout(
  agent: Agent,
  subject_uri: String,
  subject_cid: String,
  message: String,
) -> Dynamic {
  agent_shout_ffi(agent, subject_uri, subject_cid, message)
}

@external(erlang, "rocksky", "agent_refresh_session")
fn agent_refresh_session_ffi(agent: Agent) -> Dynamic

/// Proactively refresh the session (keep-alive).
pub fn refresh_session(agent: Agent) -> Dynamic {
  agent_refresh_session_ffi(agent)
}

@external(erlang, "rocksky", "agent_scrobble_match")
fn agent_scrobble_match_ffi(
  agent: Agent,
  title: String,
  artist: String,
  album: String,
  mb_id: String,
  isrc: String,
) -> Dynamic

/// Scrobble from just a title + artist (pass "" for no album; optional mb_id /
/// isrc anchor the match): resolve full metadata via matchSong, then fan out.
pub fn scrobble_match(
  agent: Agent,
  title: String,
  artist: String,
  album: String,
  mb_id: String,
  isrc: String,
) -> Dynamic {
  agent_scrobble_match_ffi(agent, title, artist, album, mb_id, isrc)
}

@external(erlang, "rocksky", "agent_sync_repo")
fn agent_sync_repo_ffi(agent: Agent) -> Dynamic

/// Download the caller's repo and (re)build the local dedup index. Requires the
/// agent to have been given a dedup store.
pub fn sync_repo(agent: Agent) -> Dynamic {
  agent_sync_repo_ffi(agent)
}

@external(erlang, "rocksky", "agent_hydrate_from_jetstream")
fn agent_hydrate_ffi(agent: Agent) -> Dynamic

/// Keep the local dedup index hydrated from Jetstream in the background.
pub fn hydrate_from_jetstream(agent: Agent) -> Dynamic {
  agent_hydrate_ffi(agent)
}
