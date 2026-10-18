import gleam/dynamic.{type Dynamic}
import gleam/javascript/promise.{type Promise}
import gleam/option.{type Option}
import rocksky_api/node/js.{type Exception}

pub type Client

@external(javascript, "./s3_ffi.mjs", "client")
pub fn client(
  region: String,
  endpoint: String,
  access_key: String,
  secret_key: String,
) -> Client

@external(javascript, "./s3_ffi.mjs", "headBucket")
pub fn head_bucket(
  client: Client,
  bucket: String,
) -> Promise(Result(Nil, Exception))

@external(javascript, "./s3_ffi.mjs", "deleteObject")
pub fn delete_object(
  client: Client,
  bucket: String,
  key: String,
) -> Promise(Result(Nil, Exception))

@external(javascript, "./s3_ffi.mjs", "putObject")
pub fn put_object(
  client: Client,
  bucket: String,
  key: String,
  body: BitArray,
  content_type: String,
) -> Promise(Result(Nil, Exception))

@external(javascript, "./s3_ffi.mjs", "getObject")
pub fn get_object(
  client: Client,
  bucket: String,
  key: String,
) -> Promise(Result(BitArray, Exception))

@external(javascript, "./s3_ffi.mjs", "presignGet")
pub fn presign_get(
  client: Client,
  bucket: String,
  key: String,
  expires_in: Int,
  content_disposition: Option(String),
) -> Promise(Result(String, Exception))

pub type StreamObject {
  StreamObject(
    body: Option(Dynamic),
    content_type: Option(String),
    content_length: Option(Int),
    content_range: Option(String),
  )
}

@external(javascript, "./s3_ffi.mjs", "getStream")
pub fn get_stream(
  client: Client,
  bucket: String,
  key: String,
  range: Option(String),
) -> Promise(Result(StreamObject, Exception))

@external(javascript, "./s3_ffi.mjs", "putObjectMetadata")
pub fn put_object_metadata(
  client: Client,
  bucket: String,
  key: String,
  body: BitArray,
  content_type: String,
  metadata: List(#(String, String)),
) -> Promise(Result(Nil, Exception))

@external(javascript, "./s3_ffi.mjs", "getObjectTimeout")
pub fn get_object_timeout(
  client: Client,
  bucket: String,
  key: String,
  timeout_ms: Int,
) -> Promise(Result(BitArray, Exception))
