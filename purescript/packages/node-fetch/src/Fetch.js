export const fetchImpl = (url, o) => {
  const init = { method: o.method, headers: o.headers, redirect: o.redirect };
  if (o.body !== null) init.body = o.body;
  if (o.signal !== null) init.signal = o.signal;
  return fetch(url, init);
};
export const status = (r) => r.status;
export const ok = (r) => r.ok;
export const headerImpl = (r) => (k) => r.headers.get(k);
export const headersObject = (r) => Object.fromEntries(r.headers.entries());
export const url = (r) => r.url;
export const textImpl = (r) => () => r.text();
export const jsonImpl = (r) => () => r.json();
export const arrayBufferImpl = (r) => () => r.arrayBuffer().then((ab) => Buffer.from(ab));
export const bodyStream = (r) => r.body;
export const webResponse = (body) => (status) => (headers) => () => new Response(body, { status, headers });
export const webResponseFromBuffer = (buf) => (status) => (headers) => () => new Response(buf, { status, headers });
export const timeoutSignal = (ms) => () => AbortSignal.timeout(ms);
export const readableToBufferImpl = (stream) => () => new Response(stream).arrayBuffer().then((ab) => Buffer.from(ab));

export const urlEncoded = fields => new URLSearchParams(fields).toString();
