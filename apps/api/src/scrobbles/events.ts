import { Hono } from "hono";

export type ScrobbleChange = { uri: string; deleted: boolean };
export type Feed = Record<string, unknown>[];

export function scrobbleChange(value: unknown): ScrobbleChange | null {
  const event = value as any;
  const commit = event?.commit;
  if (
    event?.kind !== "commit" ||
    commit?.collection !== "app.rocksky.scrobble" ||
    !["create", "update", "delete"].includes(commit.operation) ||
    typeof event.did !== "string" ||
    typeof commit.rkey !== "string"
  )
    return null;
  return {
    uri: `at://${event.did}/app.rocksky.scrobble/${commit.rkey}`,
    deleted: commit.operation === "delete",
  };
}

/** One producer and one snapshot shared by every browser, never one query per client. */
export class ScrobbleEvents {
  private listeners = new Set<(frame: string) => void>();
  private snapshot?: string;
  private pending = new Map<string, { deleted: boolean; deadline: number }>();
  private timer?: ReturnType<typeof setTimeout>;
  private running = false;
  private refreshRequested = false;
  private stopped = false;
  upstreamConnected = false;
  databaseHealthy = false;

  constructor(
    private store: {
      feed: () => Promise<Feed>;
      existing: (uris: string[]) => Promise<Set<string>>;
    },
    private retryMs = 500,
  ) {}

  get healthy() {
    return this.upstreamConnected && this.databaseHealthy;
  }
  get clients() {
    return this.listeners.size;
  }

  subscribe(send: (frame: string) => void) {
    this.listeners.add(send);
    if (this.snapshot !== undefined) send(this.snapshot);
    return () => {
      this.listeners.delete(send);
    };
  }

  change(change: ScrobbleChange) {
    if (this.stopped) return;
    // Bound memory if indexing is unavailable during a busy upstream period.
    if (this.pending.size >= 10_000)
      this.pending.delete(this.pending.keys().next().value!);
    this.pending.set(change.uri, {
      deleted: change.deleted,
      deadline: Date.now() + 60_000,
    });
    this.schedule(100);
  }

  refresh() {
    this.refreshRequested = true;
    this.schedule(0);
  }

  private schedule(delay: number) {
    if (this.stopped || this.running || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, delay);
  }

  async flush() {
    if (this.running || this.stopped) return;
    this.running = true;
    const refresh = this.refreshRequested;
    this.refreshRequested = false;
    try {
      const changes = [...this.pending];
      const existing = changes.length
        ? await this.store.existing(changes.map(([uri]) => uri))
        : new Set<string>();
      let changed = refresh;
      for (const [uri, change] of changes) {
        // A newer event for this URI must not be acknowledged by an older query.
        if (this.pending.get(uri) !== change) continue;
        if (existing.has(uri) !== change.deleted) {
          changed = true;
          this.pending.delete(uri);
        } else if (change.deadline < Date.now()) this.pending.delete(uri);
      }
      if (changed) {
        const data = JSON.stringify({ scrobbles: await this.store.feed() });
        const frame = `event: scrobbles\ndata: ${data}\n\n`;
        if (frame !== this.snapshot) {
          this.snapshot = frame;
          for (const send of this.listeners) send(frame);
        }
      }
      this.databaseHealthy = true;
    } catch (error) {
      this.databaseHealthy = false;
      this.refreshRequested = true;
      console.error(
        "Scrobble SSE refresh failed",
        error instanceof Error ? error.message : "database unavailable",
      );
    } finally {
      this.running = false;
      if (this.pending.size || this.refreshRequested)
        this.schedule(this.retryMs);
    }
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.listeners.clear();
  }
}

export function scrobbleEventsApp(
  events: ScrobbleEvents,
  start: () => void = () => {},
  heartbeatMs = 15_000,
) {
  const app = new Hono();
  app.get("/events/scrobbles", (c) => {
    start();
    let dispose = () => {};
    const body = new ReadableStream<Uint8Array>(
      {
        start(controller) {
          const encoder = new TextEncoder();
          let closed = false;
          let unsubscribe = () => {};
          let heartbeat: ReturnType<typeof setInterval> | undefined;
          dispose = () => {
            if (closed) return;
            closed = true;
            clearInterval(heartbeat);
            unsubscribe();
            c.req.raw.signal.removeEventListener("abort", dispose);
            try {
              controller.close();
            } catch {
              /* Already cancelled. */
            }
          };
          const send = (frame: string) => {
            if (closed) return;
            // Close a slow client rather than accumulating an unbounded queue.
            if ((controller.desiredSize ?? 0) <= 0) {
              dispose();
              return;
            }
            controller.enqueue(encoder.encode(frame));
          };
          send("retry: 3000\n\n");
          unsubscribe = events.subscribe(send);
          heartbeat = setInterval(
            () =>
              send(
                `event: heartbeat\ndata: ${JSON.stringify({ healthy: events.healthy })}\n\n`,
              ),
            heartbeatMs,
          );
          c.req.raw.signal.addEventListener("abort", dispose, { once: true });
          if (c.req.raw.signal.aborted) dispose();
        },
        cancel() {
          dispose();
        },
      },
      { highWaterMark: 32 },
    );
    return new Response(body, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
        "Access-Control-Allow-Origin": "*",
      },
    });
  });
  return app;
}
