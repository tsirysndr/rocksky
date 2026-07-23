import dotenv from "dotenv";
import { cleanEnv, host, num, port, str } from "envalid";

dotenv.config();

export const env = cleanEnv(process.env, {
  NODE_ENV: str({
    default: "development",
    choices: ["development", "production", "test"],
  }),
  HOST: host({ default: "localhost" }),
  PORT: port({ default: 8000 }),
  PUBLIC_URL: str({ default: "http://localhost:8000" }),
  DB_PATH: str({ devDefault: ":memory:" }),
  KV_DB_PATH: str({ devDefault: ":memory:" }),
  COOKIE_SECRET: str({ devDefault: "00000000000000000000000000000000" }),
  FRONTEND_URL: str({ devDefault: "http://localhost:5174" }),
  JWT_SECRET: str({ devDefault: "00000000000000000000000000000000" }),
  SPOTIFY_REDIRECT_URI: str({
    devDefault: "http://localhost:8000/spotify/callback",
  }),
  SPOTIFY_CLIENT_ID: str({}),
  SPOTIFY_CLIENT_SECRET: str({}),
  SPOTIFY_ENCRYPTION_KEY: str({}),
  SPOTIFY_ENCRYPTION_IV: str(),
  ROCKSKY_BETA_TOKEN: str({}),
  XATA_POSTGRES_URL: str({}),
  NATS_URL: str({ default: "nats://localhost:4222" }),
  ANALYTICS: str({ default: "http://localhost:7879" }),
  DROPBOX_CLIENT_ID: str({}),
  DROPBOX_CLIENT_SECRET: str({}),
  DROPBOX_REDIRECT_URI: str({}),
  GOOGLE_REDIRECT_URI: str({}),
  GOOGLE_DRIVE: str({ default: "http://localhost:7880" }),
  DROPBOX: str({ default: "http://localhost:7881" }),
  TRACKLIST: str({ default: "http://localhost:7884" }),
  REDIS_URL: str({ default: "redis://localhost:6379" }),
  MUSICBRAINZ_URL: str({ default: "http://localhost:8088" }),
  PRIVATE_KEY_1: str({}),
  PRIVATE_KEY_2: str({}),
  PRIVATE_KEY_3: str({}),
  DISABLED_TEALFM: str({ default: "" }),
  STORAGE_ENCRYPTION_KEY: str({
    devDefault:
      "0000000000000000000000000000000000000000000000000000000000000000",
  }),
  S3_ENDPOINT: str({}),
  S3_REGION: str({ default: "auto" }),
  S3_ACCESS_KEY_ID: str({}),
  S3_SECRET_ACCESS_KEY: str({}),
  S3_BUCKET_NAME: str({ default: "rocksky-library" }),
  S3_COVERS_BUCKET_NAME: str({ default: "rocksky" }),
  CDN_URL: str({ default: "https://cdn.rocksky.app" }),
  MEDIA_CDN_URL: str({ default: "https://files.rocksky.app" }),
  TYPESENSE_HOST: str({ default: "localhost" }),
  TYPESENSE_PORT: port({ default: 8108 }),
  TYPESENSE_PROTOCOL: str({ default: "http", choices: ["http", "https"] }),
  TYPESENSE_API_KEY: str({}),
  // Base URL of the internal navidrome (Subsonic-compat) service that the
  // app.rocksky.library.* XRPC methods proxy to. Server-to-server only.
  NAVIDROME_INTERNAL_URL: str({ default: "http://127.0.0.1:4533" }),
  // Shared secret sent as the X-Rocksky-Internal header so navidrome trusts the
  // JWT-authenticated user this proxy resolved (skips Subsonic credential auth).
  NAVIDROME_INTERNAL_SECRET: str({ devDefault: "" }),
  // Bot-scrobble guard (see lib/scrobbleGuard.ts). Set SCROBBLE_ABUSE_MAX=0 to disable.
  SCROBBLE_ABUSE_WINDOW: num({ default: 1800 }), // rolling window, seconds (30m)
  SCROBBLE_ABUSE_MAX: num({ default: 25 }), // max accepted scrobbles per window
  SCROBBLE_ABUSE_BLOCK: num({ default: 3600 }), // temp block duration, seconds (1h)
});
