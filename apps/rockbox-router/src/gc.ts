import { sql } from "./db";
import { destroyMachine } from "./fly";
import { logger } from "./logger";

// How long a machine can sit idle before we destroy it.
export const GC_IDLE_DAYS = Number(process.env.GC_IDLE_DAYS ?? 1);
// How often the in-process timer runs (default 6h). Only fires while the
// router is up — with min_machines_running=0 the router auto-stops when idle,
// so also expose an /admin/gc endpoint for an external cron to hit.
export const GC_INTERVAL_MS = Number(process.env.GC_INTERVAL_MS ?? 6 * 60 * 60 * 1000);

type Sweep = { scanned: number; destroyed: number; failed: number };

export async function gcIdleMachines(idleDays = GC_IDLE_DAYS): Promise<Sweep> {
  const rows = await sql<{ did: string; machine_id: string }[]>`
    SELECT did, machine_id
    FROM rockbox_machines
    WHERE last_used_at < NOW() - (${idleDays} || ' days')::interval
  `;
  let destroyed = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await destroyMachine(row.machine_id);
      await sql`DELETE FROM rockbox_machines WHERE did = ${row.did}`;
      destroyed++;
    } catch (e) {
      // Machine already gone → drop the orphaned row.
      if (String(e).includes("→ 404")) {
        await sql`DELETE FROM rockbox_machines WHERE did = ${row.did}`;
        destroyed++;
        continue;
      }
      logger.warn("gc: destroy failed", {
        did: row.did,
        machineId: row.machine_id,
        err: String(e),
      });
      failed++;
    }
  }
  return { scanned: rows.length, destroyed, failed };
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startGcTimer(): void {
  if (timer) return;
  const run = () => {
    logger.info("gc: sweeping idle machines", { idleDays: GC_IDLE_DAYS });
    gcIdleMachines()
      .then((r) => logger.success("gc: sweep done", r))
      .catch((e) => logger.error("gc: sweep failed", { err: String(e) }));
  };
  run();
  timer = setInterval(run, GC_INTERVAL_MS);
}
