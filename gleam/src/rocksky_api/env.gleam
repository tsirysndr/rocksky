//// Process configuration, read once at startup (replaces envalid).

import envoy
import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/result
import gleam/string
import rocksky_api/node/dotenv
import rocksky_api/node/process

pub type Env {
  Env(
    node_env: String,
    host: String,
    port: Int,
    public_url: String,
    db_path: String,
    kv_db_path: String,
    cookie_secret: String,
    frontend_url: String,
    jwt_secret: String,
    spotify_redirect_uri: String,
    spotify_client_id: String,
    spotify_client_secret: String,
    spotify_api_url: String,
    spotify_encryption_key: String,
    spotify_encryption_iv: String,
    rocksky_beta_token: String,
    xata_postgres_url: String,
    xata_read_postgres_url: String,
    xata_write_postgres_url: String,
    nats_url: String,
    analytics: String,
    tracklist: String,
    redis_url: String,
    matching_url: String,
    submissions_url: String,
    submissions_secret: String,
    musicbrainz_url: String,
    deezer_url: String,
    discogs_url: String,
    discogs_enrichment_enabled: Bool,
    private_key_1: String,
    private_key_2: String,
    private_key_3: String,
    disabled_tealfm: String,
    storage_encryption_key: String,
    s3_endpoint: String,
    s3_region: String,
    s3_access_key_id: String,
    s3_secret_access_key: String,
    s3_bucket_name: String,
    s3_covers_bucket_name: String,
    cdn_url: String,
    media_cdn_url: String,
    typesense_host: String,
    typesense_port: Int,
    typesense_protocol: String,
    typesense_api_key: String,
    navidrome_internal_url: String,
    navidrome_internal_secret: String,
    rocksky_feedgen_did: String,
    rocksky_feedgen_port: Int,
    pds_host_overrides: String,
    rocksky_signup_pds: String,
    scrobble_abuse_window: Int,
    scrobble_abuse_max: Int,
    scrobble_abuse_block: Int,
    pg_max_connections: Int,
    pg_statement_timeout: Int,
    pg_app_name: String,
    plc_directory_url: String,
    bsky_appview_url: String,
    drift_url: String,
    riff_api_url: String,
    ffmpeg_path: String,
    rocksky_xrpc_port: Int,
  )
}

fn is_dev() -> Bool {
  case envoy.get("NODE_ENV") {
    Ok("production") -> False
    _ -> True
  }
}

fn str(name: String, default: Option(String)) -> Result(String, String) {
  case envoy.get(name) {
    Ok(v) -> Ok(v)
    Error(_) ->
      case default {
        Some(d) -> Ok(d)
        None -> Error(name)
      }
  }
}

fn dev_default(name: String, dev: String) -> Result(String, String) {
  case is_dev() {
    True -> str(name, Some(dev))
    False -> str(name, None)
  }
}

fn num(name: String, default: Int) -> Result(Int, String) {
  case envoy.get(name) {
    Ok(v) ->
      int.parse(string.trim(v))
      |> result.replace_error(name <> " must be a number")
    Error(_) -> Ok(default)
  }
}

fn bool(name: String, default: Bool) -> Result(Bool, String) {
  case envoy.get(name) {
    Ok(v) ->
      case string.lowercase(string.trim(v)) {
        "true" | "1" | "yes" | "t" -> Ok(True)
        "false" | "0" | "no" | "f" | "" -> Ok(False)
        _ -> Error(name <> " must be a boolean")
      }
    Error(_) -> Ok(default)
  }
}

/// Loads `.env` and reads every variable. Exits with the list of missing or
/// invalid variables, the way envalid did.
pub fn load() -> Env {
  dotenv.config()
  case read() {
    Ok(env) -> env
    Error(problems) -> {
      print_error(
        "Invalid environment:\n  " <> string.join(list.unique(problems), "\n  "),
      )
      process.exit(1)
    }
  }
}

@external(javascript, "./env_ffi.mjs", "printError")
fn print_error(message: String) -> Nil

fn read() -> Result(Env, List(String)) {
  let d = Some
  let collected = {
    use node_env <- try_(str("NODE_ENV", d("development")))
    use host <- try_(str("HOST", d("localhost")))
    use port <- try_(num("PORT", 8000))
    use public_url <- try_(str("PUBLIC_URL", d("http://localhost:8000")))
    use db_path <- try_(dev_default("DB_PATH", ":memory:"))
    use kv_db_path <- try_(dev_default("KV_DB_PATH", ":memory:"))
    use cookie_secret <- try_(dev_default(
      "COOKIE_SECRET",
      "00000000000000000000000000000000",
    ))
    use frontend_url <- try_(dev_default(
      "FRONTEND_URL",
      "http://localhost:5174",
    ))
    use jwt_secret <- try_(dev_default(
      "JWT_SECRET",
      "00000000000000000000000000000000",
    ))
    use spotify_redirect_uri <- try_(dev_default(
      "SPOTIFY_REDIRECT_URI",
      "http://localhost:8000/spotify/callback",
    ))
    use spotify_client_id <- try_(str("SPOTIFY_CLIENT_ID", None))
    use spotify_client_secret <- try_(str("SPOTIFY_CLIENT_SECRET", None))
    use spotify_api_url <- try_(str(
      "SPOTIFY_API_URL",
      d("https://api.spotify.com/v1"),
    ))
    use spotify_encryption_key <- try_(str("SPOTIFY_ENCRYPTION_KEY", None))
    use spotify_encryption_iv <- try_(str("SPOTIFY_ENCRYPTION_IV", None))
    use rocksky_beta_token <- try_(str("ROCKSKY_BETA_TOKEN", None))
    use xata_postgres_url <- try_(str("XATA_POSTGRES_URL", None))
    use xata_read_postgres_url <- try_(str("XATA_READ_POSTGRES_URL", d("")))
    use xata_write_postgres_url <- try_(str("XATA_WRITE_POSTGRES_URL", d("")))
    use nats_url <- try_(str("NATS_URL", d("nats://localhost:4222")))
    use analytics <- try_(str("ANALYTICS", d("http://localhost:7879")))
    use tracklist <- try_(str("TRACKLIST", d("http://localhost:7884")))
    use redis_url <- try_(str("REDIS_URL", d("redis://localhost:6379")))
    use matching_url <- try_(str("MATCHING_URL", d("http://127.0.0.1:8097")))
    use submissions_url <- try_(str(
      "SUBMISSIONS_URL",
      d("http://127.0.0.1:8098"),
    ))
    use submissions_secret <- try_(str("SUBMISSIONS_SECRET", d("")))
    use musicbrainz_url <- try_(str(
      "MUSICBRAINZ_URL",
      d("http://localhost:8088"),
    ))
    use deezer_url <- try_(str("DEEZER_URL", d("http://localhost:8090")))
    use discogs_url <- try_(str("DISCOGS_URL", d("http://localhost:8095")))
    use discogs_enrichment_enabled <- try_(bool(
      "DISCOGS_ENRICHMENT_ENABLED",
      False,
    ))
    use private_key_1 <- try_(str("PRIVATE_KEY_1", None))
    use private_key_2 <- try_(str("PRIVATE_KEY_2", None))
    use private_key_3 <- try_(str("PRIVATE_KEY_3", None))
    use disabled_tealfm <- try_(str("DISABLED_TEALFM", d("")))
    use storage_encryption_key <- try_(dev_default(
      "STORAGE_ENCRYPTION_KEY",
      "0000000000000000000000000000000000000000000000000000000000000000",
    ))
    use s3_endpoint <- try_(str("S3_ENDPOINT", None))
    use s3_region <- try_(str("S3_REGION", d("auto")))
    use s3_access_key_id <- try_(str("S3_ACCESS_KEY_ID", None))
    use s3_secret_access_key <- try_(str("S3_SECRET_ACCESS_KEY", None))
    use s3_bucket_name <- try_(str("S3_BUCKET_NAME", d("rocksky-library")))
    use s3_covers_bucket_name <- try_(str("S3_COVERS_BUCKET_NAME", d("rocksky")))
    use cdn_url <- try_(str("CDN_URL", d("https://cdn.rocksky.app")))
    use media_cdn_url <- try_(str(
      "MEDIA_CDN_URL",
      d("https://files.rocksky.app"),
    ))
    use typesense_host <- try_(str("TYPESENSE_HOST", d("localhost")))
    use typesense_port <- try_(num("TYPESENSE_PORT", 8108))
    use typesense_protocol <- try_(str("TYPESENSE_PROTOCOL", d("http")))
    use typesense_api_key <- try_(str("TYPESENSE_API_KEY", None))
    use navidrome_internal_url <- try_(str(
      "NAVIDROME_INTERNAL_URL",
      d("http://127.0.0.1:4533"),
    ))
    use navidrome_internal_secret <- try_(dev_default(
      "NAVIDROME_INTERNAL_SECRET",
      "",
    ))
    use rocksky_feedgen_did <- try_(str(
      "ROCKSKY_FEEDGEN_DID",
      d("did:web:discover.rocksky.app"),
    ))
    use rocksky_feedgen_port <- try_(num("ROCKSKY_FEEDGEN_PORT", 8003))
    use pds_host_overrides <- try_(str(
      "PDS_HOST_OVERRIDES",
      d("caramelo.social.br=caramelo.tsiry.workers.dev"),
    ))
    use rocksky_signup_pds <- try_(str(
      "ROCKSKY_SIGNUP_PDS",
      d("https://rocksky.social"),
    ))
    use scrobble_abuse_window <- try_(num("SCROBBLE_ABUSE_WINDOW", 1800))
    use scrobble_abuse_max <- try_(num("SCROBBLE_ABUSE_MAX", 25))
    use scrobble_abuse_block <- try_(num("SCROBBLE_ABUSE_BLOCK", 3600))
    use pg_max_connections <- try_(num("PG_MAX_CONNECTIONS", 20))
    use pg_statement_timeout <- try_(num("PG_STATEMENT_TIMEOUT", 60_000))
    use pg_app_name <- try_(str("PG_APP_NAME", d("")))
    use plc_directory_url <- try_(str(
      "PLC_DIRECTORY_URL",
      d("https://plc.directory"),
    ))
    use bsky_appview_url <- try_(str(
      "BSKY_APPVIEW_URL",
      d("https://public.api.bsky.app"),
    ))
    use drift_url <- try_(str("DRIFT_URL", d("http://127.0.0.1:8093")))
    use riff_api_url <- try_(str("RIFF_API_URL", d("")))
    use ffmpeg_path <- try_(str("FFMPEG_PATH", d("ffmpeg")))
    use rocksky_xrpc_port <- try_(num("ROCKSKY_XRPC_PORT", 3004))
    Ok(Env(
      node_env:,
      host:,
      port:,
      public_url:,
      db_path:,
      kv_db_path:,
      cookie_secret:,
      frontend_url:,
      jwt_secret:,
      spotify_redirect_uri:,
      spotify_client_id:,
      spotify_client_secret:,
      spotify_api_url:,
      spotify_encryption_key:,
      spotify_encryption_iv:,
      rocksky_beta_token:,
      xata_postgres_url:,
      xata_read_postgres_url:,
      xata_write_postgres_url:,
      nats_url:,
      analytics:,
      tracklist:,
      redis_url:,
      matching_url:,
      submissions_url:,
      submissions_secret:,
      musicbrainz_url:,
      deezer_url:,
      discogs_url:,
      discogs_enrichment_enabled:,
      private_key_1:,
      private_key_2:,
      private_key_3:,
      disabled_tealfm:,
      storage_encryption_key:,
      s3_endpoint:,
      s3_region:,
      s3_access_key_id:,
      s3_secret_access_key:,
      s3_bucket_name:,
      s3_covers_bucket_name:,
      cdn_url:,
      media_cdn_url:,
      typesense_host:,
      typesense_port:,
      typesense_protocol:,
      typesense_api_key:,
      navidrome_internal_url:,
      navidrome_internal_secret:,
      rocksky_feedgen_did:,
      rocksky_feedgen_port:,
      pds_host_overrides:,
      rocksky_signup_pds:,
      scrobble_abuse_window:,
      scrobble_abuse_max:,
      scrobble_abuse_block:,
      pg_max_connections:,
      pg_statement_timeout:,
      pg_app_name:,
      plc_directory_url:,
      bsky_appview_url:,
      drift_url:,
      riff_api_url:,
      ffmpeg_path:,
      rocksky_xrpc_port:,
    ))
  }
  collected
}

fn try_(
  r: Result(a, String),
  next: fn(a) -> Result(b, List(String)),
) -> Result(b, List(String)) {
  case r {
    Ok(v) -> next(v)
    Error(problem) ->
      // Keep collecting so every missing variable is reported at once.
      case next(placeholder()) {
        Ok(_) -> Error([problem])
        Error(rest) -> Error([problem, ..rest])
      }
  }
}

@external(javascript, "./env_ffi.mjs", "placeholder")
fn placeholder() -> a

/// The write endpoint, falling back to the read+write URL.
pub fn write_url(env: Env) -> String {
  case env.xata_write_postgres_url {
    "" -> env.xata_postgres_url
    url -> url
  }
}

pub fn read_url(env: Env) -> String {
  case env.xata_read_postgres_url {
    "" -> env.xata_postgres_url
    url -> url
  }
}

pub fn raw(name: String) -> Option(String) {
  process.env(name)
}

pub fn raw_or(name: String, default: String) -> String {
  option.unwrap(process.env(name), default)
}

pub fn raw_int(name: String, default: Int) -> Int {
  case process.env(name) {
    Some(v) -> result.unwrap(int.parse(string.trim(v)), default)
    None -> default
  }
}

pub fn raw_bool(name: String) -> Bool {
  case process.env(name) {
    Some("1") | Some("true") | Some("yes") -> True
    _ -> False
  }
}
