//// Binding to the `typesense` client.

import gleam/dynamic.{type Dynamic}
import gleam/javascript/promise.{type Promise}
import gleam/json.{type Json}
import rocksky_api/node/js.{type Exception}

pub type Client

@external(javascript, "./typesense_ffi.mjs", "client")
pub fn client(
  host: String,
  port: Int,
  protocol: String,
  api_key: String,
  timeout_seconds: Int,
) -> Client

@external(javascript, "./typesense_ffi.mjs", "createCollection")
pub fn create_collection(
  client: Client,
  schema: Json,
) -> Promise(Result(Dynamic, Exception))

@external(javascript, "./typesense_ffi.mjs", "retrieveCollection")
pub fn retrieve_collection(
  client: Client,
  name: String,
) -> Promise(Result(Dynamic, Exception))

@external(javascript, "./typesense_ffi.mjs", "deleteCollection")
pub fn delete_collection(
  client: Client,
  name: String,
) -> Promise(Result(Dynamic, Exception))

/// Bulk import; `action` is `create`, `upsert`, `update` or `emplace`.
@external(javascript, "./typesense_ffi.mjs", "importDocuments")
pub fn import_documents(
  client: Client,
  collection: String,
  documents: Json,
  action: String,
) -> Promise(Result(Dynamic, Exception))

@external(javascript, "./typesense_ffi.mjs", "upsertDocument")
pub fn upsert_document(
  client: Client,
  collection: String,
  document: Json,
) -> Promise(Result(Dynamic, Exception))

@external(javascript, "./typesense_ffi.mjs", "deleteDocument")
pub fn delete_document(
  client: Client,
  collection: String,
  id: String,
) -> Promise(Result(Dynamic, Exception))

@external(javascript, "./typesense_ffi.mjs", "deleteDocuments")
pub fn delete_documents(
  client: Client,
  collection: String,
  filter_by: String,
) -> Promise(Result(Dynamic, Exception))

@external(javascript, "./typesense_ffi.mjs", "search")
pub fn search(
  client: Client,
  collection: String,
  params: Json,
) -> Promise(Result(Dynamic, Exception))

@external(javascript, "./typesense_ffi.mjs", "multiSearch")
pub fn multi_search(
  client: Client,
  searches: Json,
  common: Json,
) -> Promise(Result(Dynamic, Exception))

/// `ObjectNotFound` (404).
@external(javascript, "./typesense_ffi.mjs", "isNotFound")
pub fn is_not_found(e: Exception) -> Bool

@external(javascript, "./typesense_ffi.mjs", "isAlreadyExists")
pub fn is_already_exists(e: Exception) -> Bool
