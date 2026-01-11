import dotenv from "dotenv";
import { cleanEnv, str } from "envalid";
import crypto from "node:crypto";
import { v4 as uuid } from "uuid";

dotenv.config();

export const env = cleanEnv(process.env, {
  ROCKSKY_IDENTIFIER: str({ default: "" }),
  ROCKSKY_HANDLE: str({ default: "" }),
  ROCKSKY_PASSWORD: str({ default: "" }),
  JETSTREAM_SERVER: str({
    default: "wss://jetstream1.us-west.bsky.network/subscribe",
  }),
  ROCKSKY_API_KEY: str({ default: crypto.randomBytes(16).toString("hex") }),
  ROCKSKY_SHARED_SECRET: str({
    default: crypto.randomBytes(16).toString("hex"),
  }),
  ROCKSKY_WEBSCROBBLER_KEY: str({
    default: uuid(),
  }),
});
