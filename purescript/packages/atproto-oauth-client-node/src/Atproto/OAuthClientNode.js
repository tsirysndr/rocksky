import { NodeOAuthClient, TokenInvalidError, TokenRefreshError, TokenRevokedError } from "@atproto/oauth-client-node";

const store = (s) => ({
  async get(key) {
    const v = await s.get(key)();
    return v === null ? undefined : JSON.parse(v);
  },
  async set(key, val) {
    await s.set(key, JSON.stringify(val));
  },
  async del(key) {
    await s.del(key)();
  },
});

const clean = (m) => {
  const r = { ...m };
  for (const k of Object.keys(r)) if (r[k] === null) delete r[k];
  return r;
};

export const createClientImpl = (o) => () => {
  const options = {
    clientMetadata: clean(o.clientMetadata),
    stateStore: store(o.stateStore),
    sessionStore: store(o.sessionStore),
  };
  if (o.keyset !== null) options.keyset = o.keyset;
  if (o.requestLock !== null) options.requestLock = (key, fn) => o.requestLock(key, () => fn());
  if (o.fetch !== null) options.fetch = o.fetch;
  return new NodeOAuthClient(options);
};

export const clientMetadata = (c) => c.clientMetadata;
export const jwks = (c) => c.jwks;
export const restoreImpl = (c) => (did) => () => c.restore(did).then((s) => s ?? null);
export const authorizeImpl = (c) => (input) => (o) => () => c.authorize(input, clean(o)).then((u) => u.toString());
export const callbackImpl = (c) => (query) => () =>
  c.callback(new URLSearchParams(query)).then(({ session, state }) => ({ session, state: state ?? null }));
export const sessionDid = (s) => s.did;
export const isTokenRefreshError = (e) => e instanceof TokenRefreshError;
export const isTokenRevokedError = (e) => e instanceof TokenRevokedError;
export const isTokenInvalidError = (e) => e instanceof TokenInvalidError;
export const errorName = (e) => (e && e.name) || "";
export const keysetFromKeys = (keys) => keys;
