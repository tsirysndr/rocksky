import { streamSSE as honoStreamSSE } from "hono/streaming";

export const streamSSEImpl = (c, f) => honoStreamSSE(c, (stream) => f(stream));
export const writeSSEImpl = (s) => (m) => () => {
  const msg = { data: m.data };
  if (m.event !== null) msg.event = m.event;
  if (m.id !== null) msg.id = m.id;
  return s.writeSSE(msg);
};
export const sleepImpl = (s) => (ms) => () => s.sleep(ms);
export const onAbortImpl = (s, f) => {
  s.onAbort(() => f());
};
export const isAborted = (s) => () => s.aborted;
