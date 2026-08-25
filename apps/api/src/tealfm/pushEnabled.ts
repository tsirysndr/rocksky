import { ctx } from "context";
import { and, eq } from "drizzle-orm";
import { env } from "lib/env";
import tables from "schema";

/** Whether Rocksky may write teal.fm records for this user. */
export async function isTealPushEnabled(did: string): Promise<boolean> {
  return resolvePushEnabled(await readPushEnabled(did), did);
}

/** The stored preference, or null when there is no row / no choice. */
export async function readPushEnabled(did: string): Promise<boolean | null> {
  const row = await ctx.db
    .select({ pushEnabled: tables.mirrorSources.pushEnabled })
    .from(tables.mirrorSources)
    .innerJoin(tables.users, eq(tables.mirrorSources.userId, tables.users.id))
    .where(
      and(
        eq(tables.users.did, did),
        eq(tables.mirrorSources.provider, "tealfm"),
      ),
    )
    .limit(1)
    .then((rows) => rows[0]);
  return row?.pushEnabled ?? null;
}

/**
 * Column value -> what the API reports and the writer honours.
 *
 * A stored true/false is the user's own choice and stands. NULL means they
 * never chose: the default is enabled, and DISABLED_TEALFM only gets to
 * override that default.
 */
export function resolvePushEnabled(
  stored: boolean | null | undefined,
  did: string | undefined,
): boolean {
  if (stored !== null && stored !== undefined) return stored;
  return !(did && env.DISABLED_TEALFM.includes(did));
}
