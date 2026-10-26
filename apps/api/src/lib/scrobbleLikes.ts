import type { Context } from "context";
import { count, eq, inArray, sql } from "drizzle-orm";
import tables from "schema";

// Exact track-id semantics: total likes and viewer state in one round trip.
export async function scrobbleLikes(ctx: Context, ids: string[], did?: string) {
	if (!ids.length) return { counts: [], liked: [] };
	const base = ctx.db
		.select({
			trackId: tables.lovedTracks.trackId,
			count: count(),
			liked: did
				? sql<boolean>`coalesce(bool_or(${tables.users.did} = ${did}), false)`
				: sql<boolean>`false`,
		})
		.from(tables.lovedTracks);
	const query = did
		? base.leftJoin(
				tables.users,
				eq(tables.lovedTracks.userId, tables.users.id),
			)
		: base;
	const rows = await query
		.where(inArray(tables.lovedTracks.trackId, ids))
		.groupBy(tables.lovedTracks.trackId)
		.execute();
	return { counts: rows, liked: rows.filter((row) => row.liked) };
}
