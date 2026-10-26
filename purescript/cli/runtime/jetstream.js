class JetStreamClient {
  ws = null;
  options;
  reconnectAttempts = 0;
  reconnectTimer = null;
  isManualClose = false;
  eventHandlers = /* @__PURE__ */ new Map();
  cursor = null;
  constructor(options = {}) {
    this.options = {
      endpoint: options.endpoint || "wss://jetstream1.us-east.bsky.network/subscribe",
      wantedCollections: options.wantedCollections || [],
      wantedDids: options.wantedDids || [],
      maxReconnectAttempts: options.maxReconnectAttempts ?? Infinity,
      reconnectDelay: options.reconnectDelay ?? 1e3,
      maxReconnectDelay: options.maxReconnectDelay ?? 3e4,
      backoffMultiplier: options.backoffMultiplier ?? 1.5,
      debug: options.debug ?? false
    };
    ["open", "message", "error", "close", "reconnect"].forEach((event) => {
      this.eventHandlers.set(event, /* @__PURE__ */ new Set());
    });
  }
  /**
   * Register an event handler
   */
  on(event, handler) {
    this.eventHandlers.get(event)?.add(handler);
    return this;
  }
  /**
   * Remove an event handler
   */
  off(event, handler) {
    this.eventHandlers.get(event)?.delete(handler);
    return this;
  }
  /**
   * Emit an event to all registered handlers
   */
  emit(event, data) {
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
  buildUrl() {
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
  connect() {
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
          const data = JSON.parse(event.data);
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
  scheduleReconnect() {
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      this.log("error", "Max reconnection attempts reached");
      return;
    }
    const delay = Math.min(
      this.options.reconnectDelay * Math.pow(this.options.backoffMultiplier, this.reconnectAttempts),
      this.options.maxReconnectDelay
    );
    this.reconnectAttempts++;
    this.log(
      "info",
      `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`
    );
    this.reconnectTimer = setTimeout(() => {
      this.emit("reconnect", { attempt: this.reconnectAttempts });
      this.connect();
    }, delay);
  }
  /**
   * Manually disconnect from the WebSocket
   */
  disconnect() {
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
  updateFilters(options) {
    if (options.wantedCollections) {
      this.options.wantedCollections = options.wantedCollections;
    }
    if (options.wantedDids) {
      this.options.wantedDids = options.wantedDids;
    }
    if (this.ws) {
      this.disconnect();
      this.connect();
    }
  }
  /**
   * Get current connection state
   */
  get readyState() {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }
  /**
   * Check if currently connected
   */
  get isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }
  /**
   * Get current cursor position
   */
  get currentCursor() {
    return this.cursor;
  }
  /**
   * Logging utility
   */
  log(level, ...args) {
    if (this.options.debug || level === "error") {
      const prefix = `[JetStream ${level.toUpperCase()}]`;
      console[level](prefix, ...args);
    }
  }
}
export {
  JetStreamClient
};
