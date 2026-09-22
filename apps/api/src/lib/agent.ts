import { Agent, AtpAgent } from "@atproto/api";
import {
  type NodeOAuthClient,
  TokenInvalidError,
  TokenRefreshError,
  TokenRevokedError,
} from "@atproto/oauth-client-node";
import { consola } from "consola";
import extractPdsFromDid from "./extractPdsFromDid";
import { ctx } from "context";

// Body for 401 responses when the user's OAuth session with their PDS is dead
// (refresh token expired or revoked). Their Rocksky JWT may still be valid, so
// clients must distinguish this from a bad token: stop retrying and prompt the
// user to log in again.
export const pdsSessionExpired = {
  status: "unauthorized",
  error: "pds_session_expired",
  message:
    "Your session with your PDS has expired. Please log in to Rocksky again.",
} as const;

/**
 * Whether the authorization server has actually rejected this session, as
 * opposed to us merely failing to reach it.
 *
 * The distinction matters because dropping `auth_session` is irreversible from
 * the server's side: nothing can re-authorize the user, so they stay silently
 * logged out until they happen to notice and sign in again. A refresh-token
 * race, a `redlock` acquire timing out, a PDS 5xx or a socket reset are all
 * transient — the session behind them is still perfectly good.
 *
 * `@atproto/oauth-client` already deletes the stored session for exactly these
 * error types (its `deleteOnError` policy), so recognising them here is only
 * about knowing when to stop retrying. Deleting the row is the SDK's job.
 */
function isSessionRejected(e: unknown): boolean {
  return (
    e instanceof TokenRefreshError ||
    e instanceof TokenRevokedError ||
    e instanceof TokenInvalidError ||
    // `restore()` deletes the stored session before throwing this one, so
    // treating it as transient meant retrying four more times against a row the
    // SDK had just removed — each retry logging "the session was deleted by
    // another process", which is how a real deletion came to look like a race.
    // Not exported by @atproto/oauth-client, hence the name check.
    isNamed(e, "AuthMethodUnsatisfiableError")
  );
}

function isNamed(e: unknown, name: string): boolean {
  return e instanceof Error && e.name === name;
}

/**
 * Renders an error with everything `consola` drops on its own: an
 * `AggregateError`'s members and the `cause` chain under each.
 *
 * Both are load-bearing here. The SDK reports a failed session delete as
 * `AggregateError: Error while deleting stored value`, whose two members — the
 * error that triggered the delete and the one the delete itself threw — are the
 * only record of why a session went away. Logging the wrapper alone, which is
 * what `consola.warn(e)` does, throws all of it away.
 */
function describeError(e: unknown, depth = 0): string {
  if (!(e instanceof Error)) return String(e);
  const indent = "  ".repeat(depth);
  const lines = [`${indent}${e.name}: ${e.message}`];
  if (e instanceof AggregateError) {
    for (const inner of e.errors) lines.push(describeError(inner, depth + 1));
  }
  if (e.cause !== undefined) {
    lines.push(`${indent}  caused by:`);
    lines.push(describeError(e.cause, depth + 1));
  }
  return lines.join("\n");
}

/**
 * The app-password equivalent of {@link isSessionRejected}: `resumeSession`
 * rejects both when the PDS refuses the stored credentials and when it could
 * not be reached at all, and only the former should cost the user the session.
 * Duck-typed rather than `instanceof XRPCError` so this keeps working across
 * `@atproto/api` versions.
 */
function isAtpSessionRejected(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const { status, error } = e as { status?: unknown; error?: unknown };
  if (status !== 400 && status !== 401) return false;
  return (
    error === "ExpiredToken" ||
    error === "InvalidToken" ||
    error === "AccountTakedown"
  );
}

export async function createAgent(
  oauthClient: NodeOAuthClient,
  did: string,
): Promise<Agent | null> {
  let agent: Agent | null = null;
  let retry = 0;
  do {
    try {
      const result = await ctx.sqliteDb
        .selectFrom("auth_session")
        .selectAll()
        .where("key", "=", `atp:${did}`)
        .executeTakeFirst();
      if (result) {
        let pds = await ctx.redis.get(`pds:${did}`);
        if (!pds) {
          pds = await extractPdsFromDid(did);
          await ctx.redis.setEx(`pds:${did}`, 60 * 15, pds);
        }
        const atpAgent = new AtpAgent({
          service: new URL(pds),
        });

        try {
          await atpAgent.resumeSession(JSON.parse(result.session));
        } catch (e) {
          if (isAtpSessionRejected(e)) {
            consola.info(
              `Stored app-password session for ${did} was rejected by the PDS, removing it`,
            );
            consola.info(describeError(e));
            await ctx.sqliteDb
              .deleteFrom("auth_session")
              .where("key", "=", `atp:${did}`)
              .execute();
            return null;
          }
          // Could not reach the PDS. Keep the session and retry — returning the
          // agent here would hand back one with no session at all, which is
          // what surfaced downstream as "agent has no session/DID".
          consola.warn(`Could not resume the session for ${did}, retrying`);
          consola.warn(describeError(e));
          await new Promise((r) => setTimeout(r, 1000));
          retry += 1;
          continue;
        }

        return atpAgent;
      }
      let oauthSession: Awaited<ReturnType<typeof oauthClient.restore>> | null;
      try {
        oauthSession = await oauthClient.restore(did);
      } catch (e) {
        if (isSessionRejected(e)) {
          // The refresh token was revoked or expired. The SDK has already
          // dropped the stored session, so there is nothing to retry and
          // nothing for us to delete: the user has to sign in again.
          consola.info(`Session for ${did} is no longer valid`);
          consola.info(describeError(e));
          return null;
        }
        // Anything else is transient (lock contention, PDS unreachable, …).
        // Retry, and above all leave `auth_session` alone: deleting it here is
        // what silently logged users out mid-session, since only a fresh
        // browser sign-in can ever put the row back.
        consola.warn(`Could not restore the session for ${did}, retrying`);
        consola.warn(describeError(e));
        await new Promise((r) => setTimeout(r, 1000));
        retry += 1;
        continue;
      }
      agent = oauthSession ? new Agent(oauthSession) : null;
      if (agent === null) {
        await new Promise((r) => setTimeout(r, 1000));
        retry += 1;
      }
    } catch (e) {
      consola.info("Error creating agent");
      consola.info(did);
      consola.info(describeError(e));
      await new Promise((r) => setTimeout(r, 1000));
      retry += 1;
    }
  } while (agent === null && retry < 5);

  return agent;
}
