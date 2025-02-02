import dotenv from "dotenv";
import { cleanEnv, host, port, str, testOnly } from "envalid";

dotenv.config();

export const env = cleanEnv(process.env, {
  NODE_ENV: str({
    devDefault: testOnly("test"),
    choices: ["development", "production", "test"],
  }),
  HOST: host({ devDefault: testOnly("localhost") }),
  PORT: port({ devDefault: testOnly(8000) }),
  PUBLIC_URL: str({}),
  DB_PATH: str({ devDefault: ":memory:" }),
  KV_DB_PATH: str({ devDefault: ":memory:" }),
  COOKIE_SECRET: str({ devDefault: "00000000000000000000000000000000" }),
  FRONTEND_URL: str({ devDefault: "http://localhost:5174" }),
  JWT_SECRET: str({ devDefault: "00000000000000000000000000000000" }),
});
