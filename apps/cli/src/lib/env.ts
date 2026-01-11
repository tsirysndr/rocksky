import dotenv from "dotenv";
import { cleanEnv, str } from "envalid";

dotenv.config();

export const env = cleanEnv(process.env, {
  ROCKSKY_IDENTIFIER: str({ default: "" }),
  ROCKSKY_HANDLE: str({ default: "" }),
  ROCKSKY_PASSWORD: str({ default: "" }),
  JETSTREAM_SERVER: str({
    default: "wss://jetstream1.us-west.bsky.network/subscribe",
  }),
});
