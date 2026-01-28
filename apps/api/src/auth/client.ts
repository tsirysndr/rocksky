import { JoseKey } from "@atproto/jwk-jose";
import {
  AuthorizeOptions,
  NodeOAuthClient,
  NodeOAuthClientOptions,
  OAuthAuthorizationRequestParameters,
  type RuntimeLock,
} from "@atproto/oauth-client-node";
import Redis from "ioredis";
import Redlock from "redlock";
import type { Database } from "../db";
import { env } from "../lib/env";
import { SessionStore, StateStore } from "./storage";

export const FALLBACK_ALG = "ES256";

export class CustomOAuthClient extends NodeOAuthClient {
  constructor(options: NodeOAuthClientOptions) {
    super(options);
  }

  async authorize(
    input: string,
    { signal, ...options }: AuthorizeOptions = {},
  ): Promise<URL> {
    const redirectUri =
      options?.redirect_uri ?? this.clientMetadata.redirect_uris[0];
    if (!this.clientMetadata.redirect_uris.includes(redirectUri)) {
      // The server will enforce this, but let's catch it early
      throw new TypeError("Invalid redirect_uri");
    }

    const { identity, metadata } = await this.oauthResolver.resolve(input, {
      signal,
    });

    const pkce = await this.runtime.generatePKCE();
    const dpopKey = await this.runtime.generateKey(
      metadata.dpop_signing_alg_values_supported || [FALLBACK_ALG],
    );

    const state = await this.runtime.generateNonce();

    await this.stateStore.set(state, {
      iss: metadata.issuer,
      dpopKey,
      verifier: pkce.verifier,
      appState: options?.state,
    });

    const parameters: OAuthAuthorizationRequestParameters = {
      ...options,

      client_id: this.clientMetadata.client_id,
      redirect_uri: redirectUri,
      code_challenge: pkce.challenge,
      code_challenge_method: pkce.method,
      state,
      login_hint: identity && !options.prompt ? input : undefined,
      response_mode: this.responseMode,
      response_type: "code" as const,
      scope: options?.scope ?? this.clientMetadata.scope,
    };

    const authorizationUrl = new URL(metadata.authorization_endpoint);

    // Since the user will be redirected to the authorization_endpoint url using
    // a browser, we need to make sure that the url is valid.
    if (
      authorizationUrl.protocol !== "https:" &&
      authorizationUrl.protocol !== "http:"
    ) {
      throw new TypeError(
        `Invalid authorization endpoint protocol: ${authorizationUrl.protocol}`,
      );
    }

    if (metadata.pushed_authorization_request_endpoint) {
      const server = await this.serverFactory.fromMetadata(metadata, dpopKey);
      const parResponse = await server.request(
        "pushed_authorization_request",
        parameters,
      );

      authorizationUrl.searchParams.set(
        "client_id",
        this.clientMetadata.client_id,
      );
      authorizationUrl.searchParams.set("request_uri", parResponse.request_uri);
      return authorizationUrl;
    } else if (metadata.require_pushed_authorization_requests) {
      throw new Error(
        "Server requires pushed authorization requests (PAR) but no PAR endpoint is available",
      );
    } else {
      for (const [key, value] of Object.entries(parameters)) {
        if (value) authorizationUrl.searchParams.set(key, String(value));
      }

      // Length of the URL that will be sent to the server
      const urlLength =
        authorizationUrl.pathname.length + authorizationUrl.search.length;
      if (urlLength < 2048) {
        return authorizationUrl;
      } else if (!metadata.pushed_authorization_request_endpoint) {
        throw new Error("Login URL too long");
      }
    }

    throw new Error(
      "Server does not support pushed authorization requests (PAR)",
    );
  }
}

export const createClient = async (db: Database) => {
  const publicUrl = env.PUBLIC_URL;
  const url = publicUrl.includes("localhost")
    ? `http://127.0.0.1:${env.PORT}`
    : publicUrl;
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

  return new CustomOAuthClient({
    clientMetadata: {
      client_name: "Rocksky",
      client_id: !publicUrl.includes("localhost")
        ? `${url}/oauth-client-metadata.json`
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
