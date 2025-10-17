import { JoseKey } from "@atproto/jwk-jose";
import { NodeOAuthClient, type RuntimeLock } from "@atproto/oauth-client-node";
import Redis from "ioredis";
import Redlock from "redlock";
import type { Database } from "../db";
import { env } from "../lib/env";
import { SessionStore, StateStore } from "./storage";

export const createClient = async (db: Database) => {
  const publicUrl = env.PUBLIC_URL;
  const url = publicUrl || `http://127.0.0.1:${env.PORT}`;
  const enc = encodeURIComponent;

  const redis = new Redis(env.REDIS_URL);
  const redlock = new Redlock([redis]);

  const requestLock: RuntimeLock = async (key, fn) => {
    const lock = await redlock.acquire([key], 45e3); // 45 seconds
    try {
      return await fn();
    } finally {
      await lock.release();
    }
  };

  return new NodeOAuthClient({
    clientMetadata: {
      client_name: "AT Protocol Express App",
      client_id: publicUrl
        ? `${url}/client-metadata.json`
        : `http://localhost?redirect_uri=${enc(
            `${url}/oauth/callback`,
          )}&scope=${enc("atproto transition:generic")}`,
      client_uri: url,
      redirect_uris: [`${url}/oauth/callback`],
      scope: "atproto transition:generic",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      application_type: "web",
      token_endpoint_auth_method: url.startsWith("https")
        ? "private_key_jwt"
        : "none",
      token_endpoint_auth_signing_alg: url.startsWith("https")
        ? "ES256"
        : undefined,
      dpop_bound_access_tokens: true,
      jwks_uri: url.startsWith("https") ? `${url}/jwks.json` : undefined,
    },
    keyset: url.startsWith("https")
      ? await Promise.all([
          JoseKey.fromImportable(env.PRIVATE_KEY_1),
          JoseKey.fromImportable(env.PRIVATE_KEY_2),
          JoseKey.fromImportable(env.PRIVATE_KEY_3),
        ])
      : undefined,
    stateStore: new StateStore(db),
    sessionStore: new SessionStore(db),
    requestLock,
  });
};
