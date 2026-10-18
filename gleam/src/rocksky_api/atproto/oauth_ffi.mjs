import { JoseKey } from "@atproto/jwk-jose";
import {
  NodeOAuthClient,
  TokenInvalidError,
  TokenRefreshError,
  TokenRevokedError,
} from "@atproto/oauth-client-node";
import Redis from "ioredis";
import Redlock from "redlock";
import { authorize as authorizeFlow } from "../auth/oauth_client.mjs";
import { to_string as errorMessage } from "../error.mjs";
import { toList } from "../../gleam.mjs";
import { Ok, Error as GError } from "../../gleam.mjs";
import { Some, None } from "../../../gleam_stdlib/gleam/option.mjs";

import { destination } from "../lib/pds_proxy.mjs";

const unwrap = (o) => (o instanceof Some ? o[0] : undefined);
const wrap = (p, f = (v) => v) => Promise.resolve(p).then((v) => new Ok(f(v)), (e) => new GError(e));
const unwrapResult = async (p) => {
  const r = await p;
  if (r instanceof Ok) return r[0];
  throw r[0];
};

// ---- PDS host overrides at the fetch layer ------------------------------------

let overrides = new Map();
const originalFetch = globalThis.fetch.bind(globalThis);

async function pdsProxyFetch(input, init) {
  const target = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const rewritten = destination(toList([...overrides.entries()]), target);
  if (!(rewritten instanceof Some)) return originalFetch(input, init);
  const request = new Request(input, init);
  const url = new URL(rewritten[0]);
  const body =
    request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
  return originalFetch(url, {
    method: request.method,
    headers: request.headers,
    body,
    redirect: request.redirect,
    signal: request.signal,
  });
}

let installed = false;
export const installPdsProxyFetch = (pairs) => {
  overrides = new Map(pairs.toArray().map(([from, to]) => [from.toLowerCase(), to.toLowerCase()]));
  if (installed || overrides.size === 0) return;
  installed = true;
  globalThis.fetch = pdsProxyFetch;
};

// ---- client ------------------------------------------------------------------

class CustomOAuthClient extends NodeOAuthClient {
  async authorize(input, options = {}) {
    const result = await authorizeFlow(this, input, options);
    if (result instanceof GError) throw new Error(errorMessage(result[0]));
    return new URL(result[0]);
  }
}

const storeFrom = (store, expiresAtOf) => ({
  async get(key) {
    const v = await unwrapResult(store.get(key));
    return v instanceof Some ? JSON.parse(v[0]) : undefined;
  },
  async set(key, val) {
    const expires = expiresAtOf ? expiresAtOf(val) : undefined;
    await unwrapResult(store.set(key, JSON.stringify(val), expires == null ? new None() : new Some(expires)));
  },
  async del(key) {
    await unwrapResult(store.del(key));
  },
});

export const createClient = async (c) => {
  try {
    const redis = new Redis(c.redis_url);
    const redlock = new Redlock([redis]);
    const requestLock = async (key, fn) => {
      const lock = await redlock.acquire([key], 45e3);
      try {
        return await fn();
      } finally {
        await lock.release();
      }
    };
    const keyset = c.confidential
      ? await Promise.all(c.private_keys.toArray().map((k) => JoseKey.fromImportable(k)))
      : undefined;
    const client = new CustomOAuthClient({
      clientMetadata: {
        client_name: c.client_name,
        client_id: c.client_id,
        client_uri: c.client_uri,
        redirect_uris: c.redirect_uris.toArray(),
        scope: c.scope,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        application_type: "web",
        token_endpoint_auth_method: c.confidential ? "private_key_jwt" : "none",
        token_endpoint_auth_signing_alg: c.confidential ? "ES256" : undefined,
        dpop_bound_access_tokens: true,
        jwks_uri: unwrap(c.jwks_uri),
      },
      keyset,
      stateStore: storeFrom(c.state_store),
      sessionStore: storeFrom(c.session_store, (val) => val?.tokenSet?.expires_at),
      requestLock,
      fetch: pdsProxyFetch,
    });
    return new Ok(client);
  } catch (e) {
    return new GError(e);
  }
};

export const clientMetadata = (client) => client.clientMetadata;
export const authorize = (client, input, scope, prompt) =>
  wrap(client.authorize(input, { scope, prompt: unwrap(prompt) }), (url) => url.toString());
export const callback = (client, qs) =>
  wrap(client.callback(new URLSearchParams(qs)), (r) => r.session);
export const restore = (client, did) => wrap(client.restore(did));
export const sessionDid = (session) => session.did;
export const isSessionRejected = (e) =>
  e instanceof TokenRefreshError ||
  e instanceof TokenRevokedError ||
  e instanceof TokenInvalidError ||
  (e instanceof Error && e.name === "AuthMethodUnsatisfiableError");
