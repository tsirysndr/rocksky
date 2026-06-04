import { RockskyError } from "./errors.js";
import { DEFAULT_BASE_URL } from "./types.js";

/** Minimal WebSocket interface — works with browser `WebSocket`, `ws`, `bun`. */
export interface WebSocketLike {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: "open", listener: () => void): void;
  addEventListener(
    type: "close",
    listener: (event: { code: number; reason: string }) => void,
  ): void;
  addEventListener(type: "error", listener: (event: unknown) => void): void;
  addEventListener(
    type: "message",
    listener: (event: { data: unknown }) => void,
  ): void;
  removeEventListener(type: string, listener: (event: unknown) => void): void;
}

export type WebSocketCtor = new (url: string) => WebSocketLike;

export type ReconnectOptions = {
  backoffMs?: number;
  maxBackoffMs?: number;
  maxAttempts?: number;
  factor?: number;
};

export type RealtimeOptions = {
  /** Full WebSocket URL — defaults to ws(s)://api.rocksky.app/ws (derived from baseUrl). */
  url?: string;
  /** Used to derive the WS URL when `url` is not set. Default: DEFAULT_BASE_URL. */
  baseUrl?: string;
  /** JWT token required to register and send messages. */
  token: string | (() => string | Promise<string>);
  /** Display name advertised to the server when registering. */
  clientName?: string;
  /** Auto-register on connect. Default: true. */
  autoRegister?: boolean;
  /** Reconnect on close. Pass `false` to disable. Default: `{ backoffMs: 500, factor: 2, maxBackoffMs: 30000 }`. */
  reconnect?: boolean | ReconnectOptions;
  /** Send `ping` every N ms to keep the socket warm. Default: 25000. Pass 0 to disable. */
  pingIntervalMs?: number;
  /** WebSocket constructor — defaults to global `WebSocket`. Pass a fake for tests. */
  webSocket?: WebSocketCtor;
};

export type RealtimeEventMap = {
  open: void;
  close: { code: number; reason: string };
  error: unknown;
  registered: { deviceId: string };
  deviceRegistered: { deviceId: string; clientName: string };
  message: { data: unknown; device_id: string };
  control: { type: string; action: string; args?: unknown };
  raw: unknown;
};

export type RealtimeEvent = keyof RealtimeEventMap;

const RECONNECT_DEFAULTS: Required<ReconnectOptions> = {
  backoffMs: 500,
  maxBackoffMs: 30_000,
  maxAttempts: Number.POSITIVE_INFINITY,
  factor: 2,
};

export class RealtimeClient {
  private ws?: WebSocketLike;
  private listeners = new Map<RealtimeEvent, Set<(payload: unknown) => void>>();
  private reconnectAttempts = 0;
  private pingTimer?: ReturnType<typeof setInterval>;
  private closed = false;
  private deviceId?: string;
  private readonly url: string;
  private readonly reconnectOpts: Required<ReconnectOptions> | null;
  private readonly WsCtor: WebSocketCtor;

  constructor(private readonly options: RealtimeOptions) {
    this.url = options.url ?? deriveWsUrl(options.baseUrl ?? DEFAULT_BASE_URL);
    this.reconnectOpts =
      options.reconnect === false
        ? null
        : {
            ...RECONNECT_DEFAULTS,
            ...(typeof options.reconnect === "object" ? options.reconnect : {}),
          };
    const ctor = options.webSocket ?? (globalThis as { WebSocket?: WebSocketCtor }).WebSocket;
    if (!ctor) {
      throw new RockskyError(
        "No WebSocket implementation available — pass `webSocket` in options",
      );
    }
    this.WsCtor = ctor;
  }

  /** Currently registered device ID (set after the server confirms registration). */
  get currentDeviceId(): string | undefined {
    return this.deviceId;
  }

  /** Whether the underlying socket is OPEN. */
  get isOpen(): boolean {
    return this.ws?.readyState === 1;
  }

  on<E extends RealtimeEvent>(
    event: E,
    listener: (payload: RealtimeEventMap[E]) => void,
  ): () => void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(listener as (p: unknown) => void);
    this.listeners.set(event, set);
    return () => this.off(event, listener);
  }

  off<E extends RealtimeEvent>(
    event: E,
    listener: (payload: RealtimeEventMap[E]) => void,
  ): void {
    this.listeners.get(event)?.delete(listener as (p: unknown) => void);
  }

  private emit<E extends RealtimeEvent>(
    event: E,
    payload: RealtimeEventMap[E],
  ): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of set) {
      try {
        fn(payload);
      } catch (err) {
        const errSet = this.listeners.get("error");
        errSet?.forEach((f) => f(err));
      }
    }
  }

  /** Open the socket. Resolves once the WebSocket reaches OPEN. */
  async connect(): Promise<void> {
    this.closed = false;
    const ws = new this.WsCtor(this.url);
    this.ws = ws;
    await new Promise<void>((resolve, reject) => {
      const onOpen = () => {
        ws.removeEventListener("open", onOpen as never);
        ws.removeEventListener("error", onError as never);
        resolve();
      };
      const onError = (err: unknown) => {
        ws.removeEventListener("open", onOpen as never);
        ws.removeEventListener("error", onError as never);
        reject(err);
      };
      ws.addEventListener("open", onOpen);
      ws.addEventListener("error", onError);
    });
    this.attachHandlers(ws);
    this.reconnectAttempts = 0;
    this.emit("open", undefined);
    if (this.options.autoRegister !== false) {
      await this.register();
    }
    this.startPing();
  }

  /** Manually register this connection with the server. */
  async register(): Promise<void> {
    const token = await resolveToken(this.options.token);
    this.sendRaw({
      type: "register",
      clientName: this.options.clientName ?? "rocksky-sdk",
      token,
    });
  }

  /**
   * Broadcast a data message to all of the user's connected devices. The
   * server uses `data.type === "track"` for now-playing updates.
   */
  async sendMessage(data: Record<string, unknown>): Promise<void> {
    if (!this.deviceId) {
      throw new RockskyError(
        "Cannot send message — device not registered yet (await connect() first)",
      );
    }
    const token = await resolveToken(this.options.token);
    this.sendRaw({
      type: "message",
      data,
      device_id: this.deviceId,
      token,
    });
  }

  /** Send a control message to one or all devices. */
  async sendControl(args: {
    type?: string;
    target?: string;
    action: string;
    args?: unknown;
  }): Promise<void> {
    const token = await resolveToken(this.options.token);
    this.sendRaw({
      type: args.type ?? "control",
      target: args.target,
      action: args.action,
      args: args.args,
      token,
    });
  }

  /** Send a heartbeat ping. Server responds with "pong". */
  ping(): void {
    if (this.ws?.readyState === 1) this.ws.send("ping");
  }

  /** Send a raw message — escape hatch for unsupported message shapes. */
  sendRaw(payload: unknown): void {
    if (this.ws?.readyState !== 1) {
      throw new RockskyError("WebSocket is not open");
    }
    this.ws.send(typeof payload === "string" ? payload : JSON.stringify(payload));
  }

  /** Close the socket and disable reconnect. */
  async close(code = 1000, reason = "client closing"): Promise<void> {
    this.closed = true;
    this.stopPing();
    this.ws?.close(code, reason);
  }

  private attachHandlers(ws: WebSocketLike): void {
    ws.addEventListener("message", (event) => {
      const raw = event.data;
      if (raw === "pong") return;
      let parsed: unknown;
      try {
        parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      } catch {
        this.emit("raw", raw);
        return;
      }
      this.emit("raw", parsed);
      this.dispatch(parsed);
    });
    ws.addEventListener("close", (event) => {
      this.stopPing();
      this.emit("close", event);
      if (!this.closed && this.reconnectOpts) this.scheduleReconnect();
    });
    ws.addEventListener("error", (err) => {
      this.emit("error", err);
    });
  }

  private dispatch(msg: unknown): void {
    if (!msg || typeof msg !== "object") return;
    const m = msg as Record<string, unknown>;
    if (m.status === "registered" && typeof m.deviceId === "string") {
      this.deviceId = m.deviceId;
      this.emit("registered", { deviceId: m.deviceId });
      return;
    }
    if (m.type === "device_registered" && typeof m.deviceId === "string") {
      this.emit("deviceRegistered", {
        deviceId: m.deviceId,
        clientName: String(m.clientName ?? ""),
      });
      return;
    }
    if (m.type === "message" && typeof m.device_id === "string") {
      this.emit("message", {
        data: m.data,
        device_id: m.device_id,
      });
      return;
    }
    if (typeof m.action === "string") {
      this.emit("control", {
        type: String(m.type ?? "control"),
        action: m.action,
        args: m.args,
      });
    }
  }

  private scheduleReconnect(): void {
    if (!this.reconnectOpts) return;
    if (this.reconnectAttempts >= this.reconnectOpts.maxAttempts) return;
    const delay = Math.min(
      this.reconnectOpts.backoffMs *
        Math.pow(this.reconnectOpts.factor, this.reconnectAttempts),
      this.reconnectOpts.maxBackoffMs,
    );
    this.reconnectAttempts++;
    setTimeout(() => {
      if (this.closed) return;
      this.connect().catch((err) => this.emit("error", err));
    }, delay);
  }

  private startPing(): void {
    const ms = this.options.pingIntervalMs ?? 25_000;
    if (ms <= 0) return;
    this.pingTimer = setInterval(() => this.ping(), ms);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = undefined;
    }
  }
}

export function createRealtimeClient(opts: RealtimeOptions): RealtimeClient {
  return new RealtimeClient(opts);
}

/**
 * Fluent builder for the realtime client.
 *
 *   const rt = RealtimeClient.builder()
 *     .baseUrl("https://api.rocksky.app")
 *     .token(() => loadToken())
 *     .clientName("my-app")
 *     .pingInterval(20_000)
 *     .reconnect({ backoffMs: 1000, maxBackoffMs: 60_000 })
 *     .build();
 *
 *   await rt.connect();
 */
export class RealtimeClientBuilder {
  private opts: Partial<RealtimeOptions> = {};

  url(u: string): this {
    this.opts.url = u;
    return this;
  }

  baseUrl(u: string): this {
    this.opts.baseUrl = u;
    return this;
  }

  token(t: RealtimeOptions["token"]): this {
    this.opts.token = t;
    return this;
  }

  clientName(name: string): this {
    this.opts.clientName = name;
    return this;
  }

  autoRegister(value: boolean): this {
    this.opts.autoRegister = value;
    return this;
  }

  reconnect(value: boolean | ReconnectOptions): this {
    this.opts.reconnect = value;
    return this;
  }

  pingInterval(ms: number): this {
    this.opts.pingIntervalMs = ms;
    return this;
  }

  webSocket(ctor: WebSocketCtor): this {
    this.opts.webSocket = ctor;
    return this;
  }

  build(): RealtimeClient {
    if (!this.opts.token) {
      throw new RockskyError(
        "RealtimeClientBuilder: token() is required before build()",
      );
    }
    return new RealtimeClient(this.opts as RealtimeOptions);
  }
}

// biome-ignore lint/suspicious/noShadowRestrictedNames: namespace augmentation
export namespace RealtimeClient {
  export function builder(): RealtimeClientBuilder {
    return new RealtimeClientBuilder();
  }
}

function deriveWsUrl(httpBase: string): string {
  const u = new URL(httpBase);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.pathname = u.pathname.replace(/\/$/, "") + "/ws";
  return u.toString();
}

async function resolveToken(
  source: string | (() => string | Promise<string>),
): Promise<string> {
  return typeof source === "function" ? await source() : source;
}
