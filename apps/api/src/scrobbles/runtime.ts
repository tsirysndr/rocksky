import pg from "pg";
import WebSocket from "ws";
import { ScrobbleEvents, scrobbleChange } from "./events";

export function createScrobbleRuntime() {
  const connectionString =
    process.env.SCROBBLES_SSE_DATABASE_URL ||
    process.env.XATA_WRITE_POSTGRES_URL ||
    process.env.XATA_POSTGRES_URL;
  if (!connectionString)
    throw new Error("Scrobble SSE requires a primary PostgreSQL URL");
  const pool = new pg.Pool({
    connectionString,
    max: 2,
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
    idleTimeoutMillis: 30_000,
    application_name: "rocksky-scrobbles-sse",
  });
  pool.on("error", (error) =>
    console.error("Scrobble SSE pool", error.message),
  );
  const events = new ScrobbleEvents({
    async feed() {
      const { rows } = await pool.query(`WITH recent AS (
        SELECT xata_id, uri, timestamp, track_id, user_id FROM scrobbles
        ORDER BY timestamp DESC, xata_id DESC LIMIT 15
      ) SELECT s.xata_id AS id, s.uri, t.uri AS "trackUri", t.title, t.artist,
        t.album, t.album_art AS "albumArt", u.did, u.handle, u.avatar,
        s.timestamp AS "createdAt"
      FROM recent s LEFT JOIN tracks t ON t.xata_id = s.track_id
      LEFT JOIN users u ON u.xata_id = s.user_id
      ORDER BY s.timestamp DESC, s.xata_id DESC`);
      return rows;
    },
    async existing(uris) {
      const { rows } = await pool.query(
        "SELECT uri FROM scrobbles WHERE uri = ANY($1::text[])",
        [uris],
      );
      return new Set(rows.map((row) => row.uri));
    },
  });
  let socket: WebSocket | undefined;
  let reconnect: ReturnType<typeof setTimeout> | undefined;
  let watchdog: ReturnType<typeof setInterval> | undefined;
  let stopped = false;
  let started = false;
  let attempt = 0;
  let cursor: number | undefined;
  let lastMessage = Date.now();
  function connect() {
    if (stopped) return;
    const url = new URL(
      process.env.SCROBBLES_SSE_JETSTREAM_URL ||
        "wss://jetstream1.us-east.bsky.network/subscribe",
    );
    url.searchParams.set("wantedCollections", "app.rocksky.scrobble");
    if (cursor) url.searchParams.set("cursor", String(cursor));
    const current = new WebSocket(url, { handshakeTimeout: 15_000 });
    socket = current;
    current.on("open", () => {
      lastMessage = Date.now();
      events.upstreamConnected = true;
      events.refresh();
      console.info("Scrobble SSE connected to Jetstream");
    });
    current.on("message", (data) => {
      lastMessage = Date.now();
      attempt = 0;
      try {
        const event = JSON.parse(data.toString());
        if (typeof event.time_us === "number")
          cursor = Math.max(cursor || 0, event.time_us);
        const change = scrobbleChange(event);
        if (change) events.change(change);
      } catch {
        /* Ignore malformed upstream messages. */
      }
    });
    current.on("error", (error) =>
      console.error("Scrobble SSE Jetstream", error.message),
    );
    current.on("close", () => {
      events.upstreamConnected = false;
      if (!stopped)
        reconnect = setTimeout(
          connect,
          Math.min(30_000, 1000 * 2 ** Math.min(attempt++, 5)),
        );
    });
  }
  return {
    events,
    start() {
      if (started) return;
      started = true;
      events.refresh();
      connect();
      watchdog = setInterval(() => {
        if (Date.now() - lastMessage > 180_000) {
          lastMessage = Date.now();
          socket?.terminate();
        }
      }, 15_000);
    },
    async stop() {
      stopped = true;
      clearTimeout(reconnect);
      clearInterval(watchdog);
      socket?.terminate();
      events.stop();
      await pool.end();
    },
  };
}
