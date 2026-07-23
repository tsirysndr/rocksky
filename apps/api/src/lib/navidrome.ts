import type { HandlerAuth } from "@atproto/xrpc-server";
import { consola } from "consola";
import type { Context } from "context";
import { eq } from "drizzle-orm";
import users from "schema/users";
import { env } from "./env";

/**
 * Thin proxy layer for the `app.rocksky.library.*` XRPC methods.
 *
 * These methods expose the navidrome (Subsonic-compat) service for a user's
 * uploaded music library. Rather than reimplement navidrome's SQL / S3 /
 * Typesense logic in TypeScript, each XRPC method authenticates the caller via
 * the usual Rocksky JWT (→ DID), resolves the DID to the user's handle, then
 * forwards the request to the internal navidrome service — trusting it via the
 * shared `X-Rocksky-Internal` secret so navidrome skips its own Subsonic
 * credential check. navidrome stays the single source of truth.
 */

/** A Subsonic-style error surfaced by navidrome (`subsonic-response.error`). */
export class NavidromeError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = "NavidromeError";
  }

  /** Map Subsonic error codes to the closest HTTP status for the XRPC reply. */
  get httpStatus(): number {
    switch (this.code) {
      case 10: // missing required parameter
        return 400;
      case 40: // wrong username or password
      case 41: // token auth not supported
        return 401;
      case 50: // user not authorized for the operation
        return 403;
      case 70: // requested data not found
        return 404;
      default:
        return 500;
    }
  }
}

/** Raised when a JWT-authenticated DID has no matching Rocksky user row. */
export class UnknownUserError extends Error {
  constructor(did: string) {
    super(`No user found for DID ${did}`);
    this.name = "UnknownUserError";
  }
}

async function resolveHandle(ctx: Context, did: string): Promise<string> {
  const row = await ctx.db
    .select({ handle: users.handle })
    .from(users)
    .where(eq(users.did, did))
    .limit(1)
    .then((rows) => rows[0]);

  if (!row) {
    throw new UnknownUserError(did);
  }
  return row.handle;
}

/**
 * Build the Subsonic query string from the XRPC params, injecting the resolved
 * user handle as `u` and forcing JSON. Undefined/null params are dropped; any
 * client-supplied credential params are ignored (`u` is overwritten below,
 * `p`/`t`/`s` are never part of a library lexicon).
 */
function buildQuery(
  params: Record<string, unknown>,
  handle: string,
): URLSearchParams {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null) continue;
    qs.set(key, String(value));
  }
  qs.set("u", handle);
  qs.set("f", "json");
  return qs;
}

function navidromeUrl(method: string, qs: URLSearchParams): string {
  return `${env.NAVIDROME_INTERNAL_URL}/rest/${method}?${qs.toString()}`;
}

function internalHeaders(): Record<string, string> {
  return { "X-Rocksky-Internal": env.NAVIDROME_INTERNAL_SECRET };
}

/**
 * Call a navidrome JSON method and return the unwrapped `subsonic-response`
 * payload (e.g. `{ status, version, type, albumList2: {...} }`). Throws
 * `NavidromeError` when navidrome reports `status: "failed"`.
 */
export async function callNavidrome(
  ctx: Context,
  method: string,
  did: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  const handle = await resolveHandle(ctx, did);
  const res = await fetch(navidromeUrl(method, buildQuery(params, handle)), {
    headers: internalHeaders(),
  });

  const json = (await res.json().catch(() => null)) as {
    "subsonic-response"?: Record<string, unknown>;
  } | null;
  const payload = json?.["subsonic-response"];
  if (!payload) {
    throw new NavidromeError(0, `Malformed navidrome response for ${method}`);
  }
  if (payload.status === "failed") {
    const error = payload.error as
      | { code?: number; message?: string }
      | undefined;
    throw new NavidromeError(
      error?.code ?? 0,
      error?.message ?? "Navidrome error",
    );
  }
  return payload;
}

/**
 * Call a navidrome method that responds with a redirect to a media/art URL
 * (`stream`, `download`, `getCoverArt`) and return that URL. navidrome never
 * proxies bytes — it 302/307-redirects to a CDN or presigned S3 URL — so we
 * read the `Location` header and hand the URL back to the client.
 */
export async function callNavidromeForUrl(
  ctx: Context,
  method: string,
  did: string,
  params: Record<string, unknown>,
): Promise<string> {
  const handle = await resolveHandle(ctx, did);
  const res = await fetch(navidromeUrl(method, buildQuery(params, handle)), {
    headers: internalHeaders(),
    redirect: "manual",
  });

  const location = res.headers.get("location");
  if (location) {
    return location;
  }

  // No redirect — navidrome likely returned a Subsonic error envelope
  // (e.g. missing id / not found). Surface it as a NavidromeError.
  const json = (await res.json().catch(() => null)) as {
    "subsonic-response"?: {
      status?: string;
      error?: { code?: number; message?: string };
    };
  } | null;
  const payload = json?.["subsonic-response"];
  if (payload?.status === "failed") {
    throw new NavidromeError(
      payload.error?.code ?? 0,
      payload.error?.message ?? "Navidrome error",
    );
  }
  throw new NavidromeError(0, `No redirect URL returned for ${method}`);
}

type ProxyReqCtx = {
  auth: HandlerAuth;
  params?: Record<string, unknown>;
  input?: { body?: Record<string, unknown> };
};

type ProxyOptions = {
  /** Read params from the request body (procedures) instead of query params. */
  source?: "params" | "input";
  /** This method returns a media/art URL rather than a JSON payload. */
  url?: boolean;
};

/**
 * Build the XRPC method config (`{ auth, handler }`) for a library method that
 * simply proxies to navidrome. Every handler file is a one-liner on top of
 * this — keeping all auth-guarding, param-sourcing and error-mapping in one
 * place.
 */
export function proxyMethod(
  ctx: Context,
  method: string,
  options: ProxyOptions = {},
) {
  const { source = "params", url = false } = options;
  const config = {
    auth: ctx.authVerifier,
    handler: async (reqCtx: ProxyReqCtx) => {
      const did = reqCtx.auth.credentials?.did;
      if (!did) {
        return { status: 400, message: "Missing authenticated DID." };
      }

      const params =
        source === "input" ? (reqCtx.input?.body ?? {}) : (reqCtx.params ?? {});

      try {
        if (url) {
          const location = await callNavidromeForUrl(ctx, method, did, params);
          return {
            encoding: "application/json" as const,
            body: { url: location },
          };
        }
        const body = await callNavidrome(ctx, method, did, params);
        return { encoding: "application/json" as const, body };
      } catch (err) {
        if (err instanceof NavidromeError) {
          return { status: err.httpStatus, message: err.message };
        }
        if (err instanceof UnknownUserError) {
          return { status: 401, message: err.message };
        }
        consola.error(`[library.${method}]`, err);
        return { status: 500, message: `Internal error in library.${method}` };
      }
    },
  };

  // Each generated `ConfigOf` is bound to one method's specific params/output
  // type. This helper is intentionally uniform across all library methods
  // (every one just proxies to navidrome), so we widen the config to satisfy
  // every call site. `never` is assignable to each distinct ConfigOf; runtime
  // behaviour and lexicon request validation are unaffected.
  return config as unknown as never;
}
