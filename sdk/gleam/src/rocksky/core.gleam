//// Native core bindings for Rocksky.
////
//// Typed externals over the `rocksky_erl` NIF package (the shared Rust core,
//// `rocksky-sdk`): AppView reads, record writes (scrobble fan-out, like,
//// follow, shout), and the identity hashes shared across every Rocksky SDK.
//// This is the write + dedup side; the top-level `rocksky` module is the
//// read/HTTP side.
////
//// Envelope calls return `Dynamic` — an `{ok, value}` / `{error, message}`
//// tuple with binary-keyed maps (the wire shape); decode with `gleam/dynamic`.

import gleam/dynamic.{type Dynamic}

/// An opaque authenticated-agent handle (a NIF resource freed by the BEAM GC).
pub type Agent =
  Dynamic

// ---- reads (unauthenticated) --------------------------------------------

// Every read takes `base` — the AppView URL — as the last argument; pass "" for
// the default (https://api.rocksky.app).

@external(erlang, "rocksky", "profile")
fn profile_ffi(actor: String, base: String) -> Dynamic

/// An actor's detailed profile. `base` overrides the AppView URL ("" = default).
pub fn profile(actor: String, base: String) -> Dynamic {
  profile_ffi(actor, base)
}

@external(erlang, "rocksky", "scrobbles")
fn scrobbles_ffi(actor: String, limit: Int, offset: Int, base: String) -> Dynamic

/// An actor's scrobbles, newest first. `base` overrides the AppView URL.
pub fn scrobbles(actor: String, limit: Int, offset: Int, base: String) -> Dynamic {
  scrobbles_ffi(actor, limit, offset, base)
}

@external(erlang, "rocksky", "top_tracks")
fn top_tracks_ffi(limit: Int, offset: Int, base: String) -> Dynamic

/// Platform-wide top tracks chart. `base` overrides the AppView URL.
pub fn top_tracks(limit: Int, offset: Int, base: String) -> Dynamic {
  top_tracks_ffi(limit, offset, base)
}

@external(erlang, "rocksky", "global_stats")
fn global_stats_ffi(base: String) -> Dynamic

/// Platform-wide totals. `base` overrides the AppView URL ("" = default).
pub fn global_stats(base: String) -> Dynamic {
  global_stats_ffi(base)
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
