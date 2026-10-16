import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql, type SQL } from "drizzle-orm";

/**
 * Choose between filtering first and walking the recent index. PostgreSQL's
 * LIMIT plan assumes matches are spread evenly in time; older/rare artists
 * violate that assumption and cause a full recent-index scan. Materializing
 * selective matches removes that path, while broad predicates retain fast
 * recent-index pagination. EXPLAIN only plans; it does not execute the search.
 * Candidates must project `id` and `created_at` explicitly.
 */
export async function filteredPage(
  db: NodePgDatabase,
  candidates: SQL,
  limit: number,
  offset: number,
): Promise<string[]> {
  const explained = await db.execute(sql`EXPLAIN (FORMAT JSON) ${candidates}`);
  const plan = (
    explained.rows[0]?.["QUERY PLAN"] as
      | Array<{ Plan: { "Plan Rows": number } }>
      | undefined
  )?.[0]?.Plan;
  const selective = !plan || plan["Plan Rows"] <= 10000;
  const result = await db.execute<{ id: string }>(
    selective
      ? sql`WITH matches AS MATERIALIZED (${candidates}) SELECT id FROM matches ORDER BY created_at DESC, id LIMIT ${limit} OFFSET ${offset}`
      : sql`SELECT id FROM (${candidates}) matches ORDER BY created_at DESC, id LIMIT ${limit} OFFSET ${offset}`,
  );
  return result.rows.map((row) => row.id);
}
