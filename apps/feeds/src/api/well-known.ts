import { Hono } from "@hono/hono";
import { env } from "../utils/env.ts";

const app = new Hono();

app.get("/did.json", (c) => {
  return c.json({
    "@context": ["https://www.w3.org/ns/did/v1"],
    id: `did:web:${env.ROCKSKY_FEEDGEN_DOMAIN}`,
    service: [
      {
        id: "#rocksky_fg",
        type: "RockskyFeedGenerator",
        serviceEndpoint: `https://${env.ROCKSKY_FEEDGEN_DOMAIN}`,
      },
    ],
  });
});

export default app;
