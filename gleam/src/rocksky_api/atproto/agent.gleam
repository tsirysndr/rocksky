//// Binding to `@atproto/api`: `Agent` (OAuth sessions) and `AtpAgent`
//// (app-password sessions and public reads).

import gleam/dynamic.{type Dynamic}
import gleam/javascript/promise.{type Promise}
import gleam/json.{type Json}
import gleam/option.{type Option}
import rocksky_api/atproto/oauth.{type Session}
import rocksky_api/node/js.{type Exception}

pub type Agent

pub type RecordRef {
  RecordRef(uri: String, cid: String)
}

pub type Record {
  Record(uri: String, cid: Option(String), value: Dynamic)
}

pub type RecordPage {
  RecordPage(records: List(Record), cursor: Option(String))
}

@external(javascript, "./agent_ffi.mjs", "fromSession")
pub fn from_session(session: Session) -> Agent

/// An `AtpAgent` pointed at `service` (a PDS or the public AppView).
@external(javascript, "./agent_ffi.mjs", "atpAgent")
pub fn atp_agent(service: String) -> Agent

@external(javascript, "./agent_ffi.mjs", "resumeSession")
pub fn resume_session(
  agent: Agent,
  session: Dynamic,
) -> Promise(Result(Nil, Exception))

@external(javascript, "./agent_ffi.mjs", "login")
pub fn login(
  agent: Agent,
  identifier: String,
  password: String,
) -> Promise(Result(Nil, Exception))

/// The app-password session, for persisting.
@external(javascript, "./agent_ffi.mjs", "session")
pub fn session(agent: Agent) -> Dynamic

@external(javascript, "./agent_ffi.mjs", "did")
pub fn did(agent: Agent) -> Option(String)

@external(javascript, "./agent_ffi.mjs", "resolveHandle")
pub fn resolve_handle(
  agent: Agent,
  handle: String,
) -> Promise(Result(String, Exception))

/// `app.bsky.actor.getProfile`.
@external(javascript, "./agent_ffi.mjs", "getProfile")
pub fn get_profile(
  agent: Agent,
  actor: String,
) -> Promise(Result(Dynamic, Exception))

@external(javascript, "./agent_ffi.mjs", "getPreferences")
pub fn get_preferences(agent: Agent) -> Promise(Result(Dynamic, Exception))

@external(javascript, "./agent_ffi.mjs", "putRecord")
pub fn put_record(
  agent: Agent,
  repo: String,
  collection: String,
  rkey: String,
  record: Json,
  swap_record: Option(String),
) -> Promise(Result(RecordRef, Exception))

@external(javascript, "./agent_ffi.mjs", "createRecord")
pub fn create_record(
  agent: Agent,
  repo: String,
  collection: String,
  rkey: Option(String),
  record: Json,
) -> Promise(Result(RecordRef, Exception))

@external(javascript, "./agent_ffi.mjs", "getRecord")
pub fn get_record(
  agent: Agent,
  repo: String,
  collection: String,
  rkey: String,
) -> Promise(Result(Record, Exception))

@external(javascript, "./agent_ffi.mjs", "deleteRecord")
pub fn delete_record(
  agent: Agent,
  repo: String,
  collection: String,
  rkey: String,
) -> Promise(Result(Nil, Exception))

@external(javascript, "./agent_ffi.mjs", "listRecords")
pub fn list_records(
  agent: Agent,
  repo: String,
  collection: String,
  limit: Int,
  cursor: Option(String),
  reverse: Bool,
) -> Promise(Result(RecordPage, Exception))

/// Uploads a blob; the `blob` ref object to embed in a record.
@external(javascript, "./agent_ffi.mjs", "uploadBlob")
pub fn upload_blob(
  agent: Agent,
  data: BitArray,
  mime_type: String,
) -> Promise(Result(Dynamic, Exception))

/// `com.atproto.repo.applyWrites` with pre-built write objects.
@external(javascript, "./agent_ffi.mjs", "applyWrites")
pub fn apply_writes(
  agent: Agent,
  repo: String,
  writes: Json,
) -> Promise(Result(Nil, Exception))

/// The PDS answered 400/401 with ExpiredToken/InvalidToken/AccountTakedown.
@external(javascript, "./agent_ffi.mjs", "isSessionRejected")
pub fn is_session_rejected(e: Exception) -> Bool

/// The XRPC `error` name of a failed call, e.g. `RecordNotFound`.
@external(javascript, "./agent_ffi.mjs", "xrpcErrorName")
pub fn xrpc_error_name(e: Exception) -> Option(String)

/// The record key from an AT URI.
pub fn rkey_of(uri: String) -> String {
  last_segment(uri)
}

@external(javascript, "./agent_ffi.mjs", "lastSegment")
fn last_segment(uri: String) -> String

@external(javascript, "./agent_ffi.mjs", "putRecordUnchecked")
pub fn put_record_unchecked(
  agent: Agent,
  repo: String,
  collection: String,
  rkey: String,
  record: Json,
  swap_record: Option(String),
) -> Promise(Result(RecordRef, Exception))

@external(javascript, "./agent_ffi.mjs", "createRecordUnchecked")
pub fn create_record_unchecked(
  agent: Agent,
  repo: String,
  collection: String,
  rkey: String,
  record: Json,
) -> Promise(Result(RecordRef, Exception))

/// Create-only writes use an explicit null CAS, distinct from omitting CAS.
@external(javascript, "./agent_ffi.mjs", "putRecordCreateOnly")
pub fn put_record_create_only(
  agent: Agent,
  repo: String,
  collection: String,
  rkey: String,
  record: Json,
  create_only: Bool,
) -> Promise(Result(RecordRef, Exception))

@external(javascript, "./agent_ffi.mjs", "putRecordCas")
pub fn put_record_cas(
  agent: Agent,
  repo: String,
  collection: String,
  rkey: String,
  record: Json,
  expected: Option(String),
) -> Promise(Result(RecordRef, Exception))
