export interface JetStreamEvent {
  did: string;
  time_us: number;
  kind: "commit" | "identity" | "account";
  commit?: {
    rev: string;
    operation: "create" | "update" | "delete";
    collection: string;
    rkey: string;
    record?: Record<string, unknown>;
    cid?: string;
  };
  identity?: {
    did: string;
    handle?: string;
    seq?: number;
    time?: string;
  };
  account?: {
    active: boolean;
    did: string;
    seq: number;
    time: string;
  };
}

export interface JetStreamClientOptions {
  endpoint?: string;
  wantedCollections?: string[];
  wantedDids?: string[];
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
  maxReconnectDelay?: number;
  backoffMultiplier?: number;
  debug?: boolean;
}

export type JetStreamEventType =
  | "open"
  | "message"
  | "error"
  | "close"
  | "reconnect";

export class JetStreamClient {
  private ws: WebSocket | null = null;
  private options: Required<JetStreamClientOptions>;
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;
  private isManualClose = false;
  private eventHandlers: Map<
    JetStreamEventType,
    Set<(data?: unknown) => void>
  > = new Map();
  private cursor: number | null = null;

  constructor(options: JetStreamClientOptions = {}) {
    this.options = {
      endpoint:
        options.endpoint || "wss://jetstream1.us-east.bsky.network/subscribe",
      wantedCollections: options.wantedCollections || [],
      wantedDids: options.wantedDids || [],
      maxReconnectAttempts: options.maxReconnectAttempts ?? Infinity,
      reconnectDelay: options.reconnectDelay ?? 1000,
      maxReconnectDelay: options.maxReconnectDelay ?? 30000,
      backoffMultiplier: options.backoffMultiplier ?? 1.5,
      debug: options.debug ?? false,
    };

    // Initialize event handler sets
    ["open", "message", "error", "close", "reconnect"].forEach((event) => {
      this.eventHandlers.set(event as JetStreamEventType, new Set());
    });
  }

  /**
   * Register an event handler
   */
  on(event: JetStreamEventType, handler: (data?: unknown) => void): this {
    this.eventHandlers.get(event)?.add(handler);
    return this;
  }

  /**
   * Remove an event handler
   */
  off(event: JetStreamEventType, handler: (data?: unknown) => void): this {
    this.eventHandlers.get(event)?.delete(handler);
    return this;
  }

  /**
   * Emit an event to all registered handlers
   */
  private emit(event: JetStreamEventType, data?: unknown): void {
    this.eventHandlers.get(event)?.forEach((handler) => {
      try {
        handler(data);
      } catch (error) {
        this.log("error", `Handler error for ${event}:`, error);
      }
    });
  }

  /**
   * Build the WebSocket URL with query parameters
   */
  private buildUrl(): string {
    const url = new URL(this.options.endpoint);

    if (this.options.wantedCollections.length > 0) {
      this.options.wantedCollections.forEach((collection) => {
        url.searchParams.append("wantedCollections", collection);
      });
    }

    if (this.options.wantedDids.length > 0) {
      this.options.wantedDids.forEach((did) => {
        url.searchParams.append("wantedDids", did);
      });
    }

    if (this.cursor !== null) {
      url.searchParams.set("cursor", this.cursor.toString());
    }

    return url.toString();
  }

  /**
   * Connect to the JetStream WebSocket
   */
  connect(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.log("warn", "Already connected");
      return;
    }

    this.isManualClose = false;
    const url = this.buildUrl();
    this.log("info", `Connecting to ${url}`);

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.log("info", "Connected successfully");
        this.reconnectAttempts = 0;
        this.emit("open");
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as JetStreamEvent;

          // Update cursor for resumption
          if (data.time_us) {
            this.cursor = data.time_us;
          }

          this.emit("message", data);
        } catch (error) {
          this.log("error", "Failed to parse message:", error);
          this.emit("error", { type: "parse_error", error });
        }
      };

      this.ws.onerror = (event) => {
        this.log("error", "WebSocket error:", event);
        this.emit("error", event);
      };

      this.ws.onclose = (event) => {
        this.log("info", `Connection closed: ${event.code} ${event.reason}`);
        this.emit("close", event);

        if (!this.isManualClose) {
          this.scheduleReconnect();
        }
      };
    } catch (error) {
      this.log("error", "Failed to create WebSocket:", error);
      this.emit("error", { type: "connection_error", error });
      this.scheduleReconnect();
    }
  }

  /**
   * Schedule a reconnection attempt with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      this.log("error", "Max reconnection attempts reached");
      return;
    }

    const delay = Math.min(
      this.options.reconnectDelay *
        Math.pow(this.options.backoffMultiplier, this.reconnectAttempts),
      this.options.maxReconnectDelay,
    );

    this.reconnectAttempts++;
    this.log(
      "info",
      `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`,
    );

    this.reconnectTimer = setTimeout(() => {
      this.emit("reconnect", { attempt: this.reconnectAttempts });
      this.connect();
    }, delay) as unknown as number;
  }

  /**
   * Manually disconnect from the WebSocket
   */
  disconnect(): void {
    this.isManualClose = true;

    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.log("info", "Disconnected");
  }

  /**
   * Update subscription filters (requires reconnection)
   */
  updateFilters(options: {
    wantedCollections?: string[];
    wantedDids?: string[];
  }): void {
    if (options.wantedCollections) {
      this.options.wantedCollections = options.wantedCollections;
    }
    if (options.wantedDids) {
      this.options.wantedDids = options.wantedDids;
    }

    // Reconnect with new filters
    if (this.ws) {
      this.disconnect();
      this.connect();
    }
  }

  /**
   * Get current connection state
   */
  get readyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }

  /**
   * Check if currently connected
   */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Get current cursor position
   */
  get currentCursor(): number | null {
    return this.cursor;
  }

  /**
   * Logging utility
   */
  private log(level: "info" | "warn" | "error", ...args: unknown[]): void {
    if (this.options.debug || level === "error") {
      const prefix = `[JetStream ${level.toUpperCase()}]`;
      console[level](prefix, ...args);
    }
  }
}
