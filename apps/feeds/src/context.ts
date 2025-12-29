import drizzle from "./drizzle.ts";
import { configure, getConsoleSink, getLogger } from "@logtape/logtape";
import { getPrettyFormatter } from "@logtape/pretty";
import { DidResolver } from "@atp/identity";
import { AuthVerifier } from "./utils/auth.ts";
import { env } from "./utils/env.ts";

await configure({
  sinks: {
    console: getConsoleSink({
      formatter: getPrettyFormatter({
        properties: true,
        categoryStyle: "underline",
        messageColor: "rgb(255, 255, 255)",
        categoryColor: "rgb(255, 255, 255)",
        messageStyle: "reset",
      }),
    }),
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
