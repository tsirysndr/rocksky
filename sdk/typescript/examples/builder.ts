import { RockskyClient } from "../src";

const client = RockskyClient.builder()
  .baseUrl("https://api.rocksky.app")
  .bearer(process.env.ROCKSKY_TOKEN ?? "")
  .userAgent("rocksky-example/0.1")
  .timeout(10_000)
  .retries(3)
  .retryDelay(200)
  .build();

const me = await client.actor.getProfile();
console.log("me:", me);

// Build a one-off variant without an auth token (e.g. for a public read).
const anon = client.withAuth("");
const recent = await anon.scrobble.getScrobbles({ limit: 10 });
console.log("recent scrobbles:", recent);
