import { RealtimeClient, createClient } from "../src";

// ── Builder style ────────────────────────────────────────────────────────
const rt = RealtimeClient.builder()
  .baseUrl("https://api.rocksky.app")
  .token(process.env.ROCKSKY_TOKEN ?? "")
  .clientName("realtime-example")
  .pingInterval(20_000)
  .reconnect({ backoffMs: 1000, maxBackoffMs: 60_000 })
  .build();

rt.on("open", () => console.log("connected"));
rt.on("registered", ({ deviceId }) => console.log("registered as", deviceId));
rt.on("deviceRegistered", ({ deviceId, clientName }) =>
  console.log("new sibling device:", clientName, deviceId),
);
rt.on("message", ({ data, device_id }) =>
  console.log("[msg from", device_id, "]", data),
);
rt.on("control", (c) => console.log("[control]", c));
rt.on("close", ({ code, reason }) => console.log("closed", code, reason));
rt.on("error", (err) => console.error("ws error", err));

await rt.connect();

// Broadcast a now-playing update to all your registered devices.
await rt.sendMessage({
  type: "track",
  title: "Heart of Glass",
  artist: "Blondie",
  album: "Parallel Lines",
});

// ── Or, inherit baseUrl from an existing RockskyClient ───────────────────
const c = createClient({ baseUrl: "https://api.rocksky.app" });
const rt2 = c.realtime({
  token: process.env.ROCKSKY_TOKEN ?? "",
  clientName: "via-client",
});
rt2.on("message", (m) => console.log("rt2 saw:", m));
await rt2.connect();

// Keep the process alive for 10s, then close.
await new Promise((r) => setTimeout(r, 10_000));
await rt.close();
await rt2.close();
