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

export type ListenerFilter = { dids: string[]; handles: string[] };

function listenerFilter(params: URLSearchParams): ListenerFilter {
  const read = (name: string, normalize: (v: string) => string) => {
    const values = new Set<string>();
    for (const key of [name, name + "s", name + "[]", name + "s[]"]) {
      for (const part of params.getAll(key).flatMap((v) => v.split(","))) {
        const value = normalize(part.trim());
        if (!value) throw new Error("Empty listener filter");
        values.add(value);
      }
    }
    return [...values].sort();
  };
  return {
    dids: read("did", (v) => v),
    handles: read("handle", (v) => v.replace(/^@/, "").toLowerCase()),
  };
}

type Audience = {
  filter: ListenerFilter;
  listeners: Set<(frame: string) => void>;
  snapshot?: string;
  owners: Set<string>;
};
function audience(filter: ListenerFilter): Audience {
  return { filter, listeners: new Set(), owners: new Set() };
}

/** One Jetstream producer, with snapshots shared by equivalent subscriptions. */
export class ScrobbleEvents {
  private global = audience({ dids: [], handles: [] });
  private filtered = new Map<string, Audience>();
  private pending = new Map<string, { deleted: boolean; deadline: number }>();
  private timer?: ReturnType<typeof setTimeout>;
  private running = false;
  private refreshRequested = false;
  private stopped = false;
  upstreamConnected = false;
  databaseHealthy = false;

  constructor(
    private store: {
      feed: (filter: ListenerFilter) => Promise<Feed>;
      handlesForDids: (dids: string[]) => Promise<string[]>;
      existing: (uris: string[]) => Promise<Set<string>>;
    },
    private retryMs = 500,
  ) {}

  get healthy() {
    return this.upstreamConnected && this.databaseHealthy;
  }
  get clients() {
    let count = this.global.listeners.size;
    for (const group of this.filtered.values()) count += group.listeners.size;
    return count;
  }

  subscribe(send: (frame: string) => void, filter = this.global.filter) {
    const key = JSON.stringify(filter);
    let group = this.global;
    if (filter.dids.length || filter.handles.length) {
      group = this.filtered.get(key) ?? audience(filter);
      this.filtered.set(key, group);
      if (group.snapshot === undefined) this.schedule(0);
    }
    group.listeners.add(send);
    if (group.snapshot !== undefined) send(group.snapshot);
    return () => {
      group.listeners.delete(send);
      if (!group.listeners.size && this.filtered.get(key) === group)
        this.filtered.delete(key);
    };
  }

  private async publish(group: Audience) {
    const rows = await this.store.feed(group.filter);
    const frame = `event: scrobbles\ndata: ${JSON.stringify({ scrobbles: rows })}\n\n`;
    if (frame === group.snapshot) return;
    group.snapshot = frame;
    group.owners = new Set(
      rows.flatMap((row) => (typeof row.did === "string" ? [row.did] : [])),
    );
    for (const send of group.listeners) send(frame);
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
      const dids = new Set<string>();
      for (const [uri, change] of changes) {
        // A newer event for this URI must not be acknowledged by an older query.
        if (this.pending.get(uri) !== change) continue;
        if (existing.has(uri) !== change.deleted) {
          dids.add(uri.slice(5, uri.indexOf("/", 5)));
          this.pending.delete(uri);
        } else if (change.deadline < Date.now()) this.pending.delete(uri);
      }
      if (dids.size || refresh) await this.publish(this.global);
      const groups = [...this.filtered.values()];
      const handles = new Set(
        !refresh && dids.size && groups.some((g) => g.filter.handles.length)
          ? await this.store.handlesForDids([...dids])
          : [],
      );
      for (const group of groups) {
        if (
          refresh ||
          group.snapshot === undefined ||
          group.filter.dids.some((did) => dids.has(did)) ||
          group.filter.handles.some((handle) => handles.has(handle)) ||
          [...dids].some((did) => group.owners.has(did))
        ) {
          await this.publish(group);
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
      if (
        this.pending.size ||
        this.refreshRequested ||
        [...this.filtered.values()].some((g) => g.snapshot === undefined)
      )
        this.schedule(this.retryMs);
    }
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.global.listeners.clear();
    for (const group of this.filtered.values()) group.listeners.clear();
    this.filtered.clear();
  }
}

export function scrobbleEventsApp(
  events: ScrobbleEvents,
  start: () => void = () => {},
  heartbeatMs = 15_000,
) {
  const app = new Hono();
  app.get("/events/scrobbles", (c) => {
    let filter: ListenerFilter;
    try {
      filter = listenerFilter(new URL(c.req.url).searchParams);
    } catch {
      return c.json(
        { error: "DID and handle filter values must be nonempty" },
        400,
      );
    }
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
          unsubscribe = events.subscribe(send, filter);
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
