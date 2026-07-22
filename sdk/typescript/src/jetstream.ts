import type { RockskyIndex } from "./dedup.js";

/** The four public Bluesky Jetstream servers. */
export const DEFAULT_JETSTREAM_SERVERS = [
  "wss://jetstream1.us-east.bsky.network",
  "wss://jetstream2.us-east.bsky.network",
  "wss://jetstream1.us-west.bsky.network",
  "wss://jetstream2.us-west.bsky.network",
];

const RECONNECT_SLACK_US = 5_000_000;

export interface JetstreamOptions {
  /** Servers to connect to at once (defaults to {@link DEFAULT_JETSTREAM_SERVERS}). */
  servers?: string[];
  /** Cancels the hydration and closes all connections when aborted. */
  signal?: AbortSignal;
}

interface JetEvent {
  did: string;
  time_us: number;
  kind: string;
  commit?: {
    operation: string;
    collection: string;
    rkey: string;
    record?: Record<string, unknown>;
  };
}

// A shared, mutable watermark — the highest time_us processed across sources.
interface Watermark {
  v: number;
}

/**
 * Hydrate `idx` from the Bluesky Jetstream firehose for `did`, connecting to
 * every server at once, filtered to app.rocksky.* + this DID. A shared watermark
 * de-duplicates the overlap between servers and is the reconnect cursor. Resolves
 * when opts.signal aborts; each source reconnects with backoff.
 */
export async function runJetstream(idx: RockskyIndex, did: string, opts: JetstreamOptions = {}): Promise<void> {
  const servers = opts.servers ?? DEFAULT_JETSTREAM_SERVERS;
  const wm: Watermark = { v: await idx.cursor(did) };
  await Promise.all(servers.map((s) => sourceLoop(s, idx, did, wm, opts.signal)));
}

async function sourceLoop(server: string, idx: RockskyIndex, did: string, wm: Watermark, signal?: AbortSignal) {
  while (!signal?.aborted) {
    const cursor = Math.max(0, wm.v - RECONNECT_SLACK_US);
    try {
      await connect(subscribeURL(server, did, cursor), idx, did, wm, signal);
    } catch {
      // fall through to backoff
    }
    await sleep(2000, signal);
  }
}

function connect(url: string, idx: RockskyIndex, did: string, wm: Watermark, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    const ws = new WebSocket(url);
    const onAbort = () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    const done = () => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };

    ws.onmessage = (ev: MessageEvent) => {
      let event: JetEvent;
      try {
        event = JSON.parse(typeof ev.data === "string" ? ev.data : String(ev.data));
      } catch {
        return;
      }
      if (event.kind !== "commit" || event.did !== did || !event.commit) return;
      // Claim this event for exactly one source (single-threaded: set before await).
      if (event.time_us <= wm.v) return;
      wm.v = event.time_us;
      const c = event.commit;
      void idx
        .applyCommit(event.did, c.collection, c.operation, c.rkey, c.record)
        .then(() => idx.setCursor(did, event.time_us))
        .catch(() => {});
    };
    ws.onclose = done;
    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      done();
    };
  });
}

function subscribeURL(server: string, did: string, cursorUS: number): string {
  let u = `${server.replace(/\/+$/, "")}/subscribe?wantedCollections=app.rocksky.*&wantedDids=${encodeURIComponent(did)}`;
  if (cursorUS > 0) u += `&cursor=${cursorUS}`;
  return u;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    }, { once: true });
  });
}
