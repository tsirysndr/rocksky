import { cleanEnv, str, port, host, testOnly } from "envalid";
import process from "node:process";

export const env = cleanEnv(process.env, {
  NODE_ENV: str({
    devDefault: testOnly("test"),
    choices: ["development", "production", "test"],
  }),

  ROCKSKY_FEEDGEN_DOMAIN: host({ devDefault: "localhost" }),
  ROCKSKY_FEEDGEN_PORT: port({ devDefault: 8002 }),
  XATA_POSTGRES_URL: str({
    devDefault:
      "postgresql://postgres:mysecretpassword@localhost:5433/rocksky?sslmode=disable",
  }),
});
