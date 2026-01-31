import dotenv from "dotenv";
import { cleanEnv, host, port, str } from "envalid";

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
  MEILISEARCH_URL: str({ default: "http://localhost:7700" }),
  MEILISEARCH_API_KEY: str({}),
  DISABLED_TEALFM: str({ default: "" }),
});
