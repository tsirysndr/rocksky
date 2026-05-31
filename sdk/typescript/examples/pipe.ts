import {
  createClient,
  map,
  pipe,
  tap,
  withFallback,
  withRetry,
  withTimeout,
} from "../src";

const client = createClient({ auth: process.env.ROCKSKY_TOKEN });

// Pass a thunk so withRetry can re-invoke the network call.
const handle = await pipe(
  () =>
    client.actor.getProfile<{ handle: string; displayName?: string }>({
      did: "tsiry.bsky.social",
    }),
  withRetry(3, { delayMs: 200 }),
  withTimeout(5_000),
  tap((p) => console.log("loaded", p.handle)),
  map((p) => p.displayName ?? p.handle),
  withFallback("anonymous"),
);

console.log("display:", handle);
