import type {
  NodeSavedSession,
  NodeSavedSessionStore,
  NodeSavedState,
  NodeSavedStateStore,
} from "@atproto/oauth-client-node";
import { consola } from "consola";
import type { Database } from "../db";

/**
 * SQLite reports "the file is locked right now" as an error, not as a wait, so
 * every call here has to treat it as retryable. `busy_timeout` handles most of
 * it, but two processes share `atproto.sqlite` — the XRPC service and the REST
 * API — and either can be mid-write when the other arrives.
 */
const BUSY_CODES = new Set([
  "SQLITE_BUSY",
  "SQLITE_BUSY_SNAPSHOT",
  "SQLITE_LOCKED",
  "SQLITE_PROTOCOL",
]);

const isBusy = (err: unknown) =>
  BUSY_CODES.has((err as { code?: string })?.code ?? "");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Retries a session-store operation while SQLite reports the file as busy.
 *
 * This matters far more than a lock usually would, because `@atproto/oauth-client`
 * treats both failure modes as facts about the session rather than about the
 * disk. A read that throws is swallowed into `undefined`, which the SDK reads as
 * "the session was deleted by another process" and turns into a 401 for a user
 * whose session is perfectly good. A write that throws reaches `onStoreError`,
 * which *revokes the refresh token at the PDS* — costing that user their login
 * for real, and permanently. Neither is recoverable once it has happened, so a
 * transient lock must never be allowed to reach the SDK.
 */
async function retryOnBusy<T>(
  label: string,
  op: () => T | Promise<T>,
): Promise<T> {
  const delays = [10, 25, 50, 100, 250];
  for (let attempt = 0; ; attempt++) {
    try {
      // Awaited, not returned: Kysely hands back a promise, so a SQLITE_BUSY
      // arrives as a rejection that a bare `return op()` would never catch.
      return await op();
    } catch (err) {
      if (!isBusy(err) || attempt >= delays.length) {
        if (isBusy(err)) {
          consola.error(
            `auth store ${label} still locked after ${delays.length} retries`,
            err,
          );
        }
        throw err;
      }
      await sleep(delays[attempt]);
    }
  }
}

export class StateStore implements NodeSavedStateStore {
  constructor(private db: Database) {}
  async get(key: string): Promise<NodeSavedState | undefined> {
    const result = await retryOnBusy("state.get", () =>
      this.db
        .selectFrom("auth_state")
        .selectAll()
        .where("key", "=", key)
        .executeTakeFirst(),
    );
    if (!result) return;
    return JSON.parse(result.state) as NodeSavedState;
  }
  async set(key: string, val: NodeSavedState) {
    const state = JSON.stringify(val);
    await retryOnBusy("state.set", () =>
      this.db
        .insertInto("auth_state")
        .values({ key, state })
        .onConflict((oc) => oc.doUpdateSet({ state }))
        .execute(),
    );
  }
  async del(key: string) {
    await retryOnBusy("state.del", () =>
      this.db.deleteFrom("auth_state").where("key", "=", key).execute(),
    );
  }
}

export class SessionStore implements NodeSavedSessionStore {
  constructor(private db: Database) {}
  async get(key: string): Promise<NodeSavedSession | undefined> {
    const result = await retryOnBusy("session.get", () =>
      this.db
        .selectFrom("auth_session")
        .selectAll()
        .where("key", "=", key)
        .executeTakeFirst(),
    );
    if (!result) return;
    return JSON.parse(result.session) as NodeSavedSession;
  }
  async set(key: string, val: NodeSavedSession) {
    const session = JSON.stringify(val);
    await retryOnBusy("session.set", () =>
      this.db
        .insertInto("auth_session")
        .values({ key, session, expiresAt: val.tokenSet.expires_at })
        .onConflict((oc) =>
          oc.doUpdateSet({ session, expiresAt: val.tokenSet.expires_at }),
        )
        .execute(),
    );
  }
  async del(key: string) {
    await retryOnBusy("session.del", () =>
      this.db.deleteFrom("auth_session").where("key", "=", key).execute(),
    );
  }
}
