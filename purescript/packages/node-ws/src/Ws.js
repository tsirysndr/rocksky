import { WebSocket, WebSocketServer } from "ws";

const dropNulls = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));

export const newWebSocket = (url) => () => new WebSocket(url);
export const newWithHeaders = (url) => (headers) => () => new WebSocket(url, { headers });

export const onImpl = (event) => (ws, f) => {
  ws.on(event, (...args) => f(...args));
};
export const onMessageImpl = (asString) => (ws, f) => {
  ws.on("message", (data, isBinary) => {
    if (asString) {
      f(typeof data === "string" ? data : Buffer.isBuffer(data) ? data.toString("utf8") : Buffer.concat(data).toString("utf8"));
    } else {
      f(Buffer.isBuffer(data) ? data : Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data));
    }
  });
};
export const unsafeFromForeign = (x) => x;
export const bufferToString = (b) => (Buffer.isBuffer(b) ? b.toString("utf8") : String(b ?? ""));

export const send = (ws) => (s) => () => {
  ws.send(s);
};
export const sendBuffer = (ws) => (b) => () => {
  ws.send(b);
};
export const ping = (ws) => () => {
  ws.ping();
};
export const close = (ws) => () => {
  ws.close();
};
export const closeWith = (ws) => (code) => (reason) => () => {
  ws.close(code, reason);
};
export const terminate = (ws) => () => {
  ws.terminate();
};
export const readyState = (ws) => () => ws.readyState;

export const newServer = (opts) => () => new WebSocketServer(dropNulls(opts));
export const onServerImpl = (event) => (s, f) => {
  s.on(event, (...args) => f(...args));
};
export const clients = (s) => () => [...s.clients];
export const closeServer = (s) => () => {
  s.close();
};
