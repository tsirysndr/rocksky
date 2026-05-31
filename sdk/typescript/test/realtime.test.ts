import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  RealtimeClient,
  RockskyError,
  createClient,
  createRealtimeClient,
} from "../src";
import type { WebSocketLike } from "../src/realtime";

// ─── Fake WebSocket ───────────────────────────────────────────────────────

const sockets: FakeWebSocket[] = [];

class FakeWebSocket implements WebSocketLike {
  readyState = 0;
  sent: string[] = [];
  url: string;
  listeners: Record<string, ((e: unknown) => void)[]> = {
    open: [],
    close: [],
    error: [],
    message: [],
  };
  constructor(url: string) {
    this.url = url;
    sockets.push(this);
    // open asynchronously
    queueMicrotask(() => {
      this.readyState = 1;
      this.listeners.open?.forEach((fn) => fn(undefined));
    });
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(code = 1000, reason = ""): void {
    this.readyState = 3;
    this.listeners.close?.forEach((fn) => fn({ code, reason }));
  }
  // biome-ignore lint/suspicious/noExplicitAny: shape matches the union type
  addEventListener(type: string, listener: (e: any) => void): void {
    (this.listeners[type] ??= []).push(listener);
  }
  // biome-ignore lint/suspicious/noExplicitAny: shape matches the union type
  removeEventListener(type: string, listener: (e: any) => void): void {
    const arr = this.listeners[type] ?? [];
    const idx = arr.indexOf(listener);
    if (idx >= 0) arr.splice(idx, 1);
  }
  /** Test helper: simulate a server message. */
  fire(data: unknown): void {
    this.listeners.message?.forEach((fn) =>
      fn({ data: typeof data === "string" ? data : JSON.stringify(data) }),
    );
  }
  /** Test helper: simulate server-initiated close. */
  triggerClose(code = 1006, reason = "lost"): void {
    this.readyState = 3;
    this.listeners.close?.forEach((fn) => fn({ code, reason }));
  }
  sentJson(): unknown[] {
    return this.sent.map((s) => (s === "ping" ? s : JSON.parse(s)));
  }
}

beforeEach(() => {
  sockets.length = 0;
});

afterEach(() => {
  sockets.length = 0;
});

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("RealtimeClient", () => {
  it("connects and auto-registers", async () => {
    const rt = createRealtimeClient({
      url: "ws://test/ws",
      token: "TOK",
      clientName: "tester",
      webSocket: FakeWebSocket as never,
      pingIntervalMs: 0,
    });
    await rt.connect();
    expect(sockets.length).toBe(1);
    const ws = sockets[0]!;
    const messages = ws.sentJson();
    expect(messages[0]).toEqual({
      type: "register",
      clientName: "tester",
      token: "TOK",
    });
    await rt.close();
  });

  it("emits 'registered' on server confirmation", async () => {
    const rt = createRealtimeClient({
      url: "ws://test/ws",
      token: "T",
      webSocket: FakeWebSocket as never,
      pingIntervalMs: 0,
    });
    const events: { deviceId: string }[] = [];
    rt.on("registered", (e) => events.push(e));
    await rt.connect();
    sockets[0]!.fire({ status: "registered", deviceId: "dev-1" });
    expect(events).toEqual([{ deviceId: "dev-1" }]);
    expect(rt.currentDeviceId).toBe("dev-1");
    await rt.close();
  });

  it("emits 'message' on broadcast", async () => {
    const rt = createRealtimeClient({
      url: "ws://test/ws",
      token: "T",
      webSocket: FakeWebSocket as never,
      pingIntervalMs: 0,
    });
    const seen: { data: unknown; device_id: string }[] = [];
    rt.on("message", (m) => seen.push(m));
    await rt.connect();
    sockets[0]!.fire({
      type: "message",
      data: { type: "track", title: "x", artist: "y" },
      device_id: "dev-2",
    });
    expect(seen.length).toBe(1);
    expect(seen[0]!.device_id).toBe("dev-2");
    await rt.close();
  });

  it("sendMessage requires registration first", async () => {
    const rt = createRealtimeClient({
      url: "ws://test/ws",
      token: "T",
      webSocket: FakeWebSocket as never,
      autoRegister: false,
      pingIntervalMs: 0,
    });
    await rt.connect();
    await expect(rt.sendMessage({ type: "track" })).rejects.toBeInstanceOf(
      RockskyError,
    );
    await rt.close();
  });

  it("sendMessage attaches device_id and token", async () => {
    const rt = createRealtimeClient({
      url: "ws://test/ws",
      token: "TOK",
      webSocket: FakeWebSocket as never,
      pingIntervalMs: 0,
    });
    await rt.connect();
    sockets[0]!.fire({ status: "registered", deviceId: "dev-x" });
    await rt.sendMessage({ type: "track", title: "Foo" });
    const messages = sockets[0]!.sentJson();
    expect(messages.at(-1)).toEqual({
      type: "message",
      data: { type: "track", title: "Foo" },
      device_id: "dev-x",
      token: "TOK",
    });
    await rt.close();
  });

  it("ping() sends 'ping' as raw text", async () => {
    const rt = createRealtimeClient({
      url: "ws://test/ws",
      token: "T",
      webSocket: FakeWebSocket as never,
      pingIntervalMs: 0,
    });
    await rt.connect();
    rt.ping();
    expect(sockets[0]!.sent.at(-1)).toBe("ping");
    await rt.close();
  });

  it("resolves async token providers", async () => {
    let n = 0;
    const rt = createRealtimeClient({
      url: "ws://test/ws",
      token: async () => `tok-${++n}`,
      webSocket: FakeWebSocket as never,
      pingIntervalMs: 0,
    });
    await rt.connect();
    sockets[0]!.fire({ status: "registered", deviceId: "d" });
    await rt.sendMessage({ type: "track" });
    const msgs = sockets[0]!.sentJson() as Record<string, unknown>[];
    expect(msgs[0]!.token).toBe("tok-1");
    expect(msgs.at(-1)!.token).toBe("tok-2");
    await rt.close();
  });

  it("reconnects on unexpected close", async () => {
    const rt = createRealtimeClient({
      url: "ws://test/ws",
      token: "T",
      webSocket: FakeWebSocket as never,
      pingIntervalMs: 0,
      reconnect: { backoffMs: 1, maxBackoffMs: 5 },
    });
    await rt.connect();
    expect(sockets.length).toBe(1);
    sockets[0]!.triggerClose();
    await new Promise((r) => setTimeout(r, 10));
    expect(sockets.length).toBeGreaterThanOrEqual(2);
    await rt.close();
  });

  it("does NOT reconnect after explicit close()", async () => {
    const rt = createRealtimeClient({
      url: "ws://test/ws",
      token: "T",
      webSocket: FakeWebSocket as never,
      pingIntervalMs: 0,
      reconnect: { backoffMs: 1 },
    });
    await rt.connect();
    await rt.close();
    await new Promise((r) => setTimeout(r, 20));
    expect(sockets.length).toBe(1);
  });

  it("client.realtime(...) inherits baseUrl as ws URL", async () => {
    const c = createClient({ baseUrl: "https://api.example.test" });
    const rt = c.realtime({
      token: "T",
      webSocket: FakeWebSocket as never,
      pingIntervalMs: 0,
    });
    await rt.connect();
    expect(sockets[0]!.url).toBe("wss://api.example.test/ws");
    await rt.close();
  });

  it("builder produces an equivalent client", async () => {
    const rt = RealtimeClient.builder()
      .url("ws://test/ws")
      .token("TOK")
      .clientName("via-builder")
      .pingInterval(0)
      .webSocket(FakeWebSocket as never)
      .build();
    await rt.connect();
    const first = sockets[0]!.sentJson()[0] as { clientName: string };
    expect(first.clientName).toBe("via-builder");
    await rt.close();
  });

  it("builder throws if token() missing", () => {
    expect(() =>
      RealtimeClient.builder().clientName("x").build(),
    ).toThrowError(RockskyError);
  });
});
