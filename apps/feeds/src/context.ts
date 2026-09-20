import drizzle from "./drizzle.ts";
import {
  configure,
  defaultTextFormatter,
  getConsoleSink,
  getLogger,
} from "@logtape/logtape";
import { getPrettyFormatter } from "@logtape/pretty";
import { DidResolver } from "@atp/identity";
import { AuthVerifier } from "./utils/auth.ts";
import { env } from "./utils/env.ts";

// Deno turns every console.* call into an OTLP log record, correlated with the
// span that is active at the time — so the console sink is also the log
// exporter, and its output has to stay plain when telemetry is on.
const formatter = env.OTEL_DENO
  ? defaultTextFormatter
  : getPrettyFormatter({
    properties: true,
    categoryStyle: "underline",
    messageColor: "rgb(255, 255, 255)",
    categoryColor: "rgb(255, 255, 255)",
    messageStyle: "reset",
  });

await configure({
  sinks: {
    console: getConsoleSink({ formatter }),
  },
  loggers: [
    { category: "feedgen", lowestLevel: "info", sinks: ["console"] },
    { category: ["logtape", "meta"], lowestLevel: "error", sinks: ["console"] },
  ],
});

const logger = getLogger("feedgen");
const ownDid = `did:web:${env.ROCKSKY_FEEDGEN_DOMAIN}`;
const didResolver = new DidResolver({});
const authVerifier = new AuthVerifier(ownDid, didResolver);

export const ctx = {
  db: drizzle.db,
  logger,
  ownDid,
  authVerifier,
};

export type Context = typeof ctx;

export type AppEnv = {
  Bindings: Context;
};
