import { consola } from "consola";
import { runSweep } from "./src/sweep.ts";
import { env } from "./src/utils/env.ts";

consola.info(
  `[scrobble-abuse-sweep] starting — cron="${env.SWEEP_CRON}" ` +
    `dryRun=${env.SWEEP_DRY_RUN} lookback=${env.SWEEP_LOOKBACK_HOURS}h`,
);

// Native Deno scheduler (requires --unstable-cron). Overlapping runs are
// suppressed by the runtime, so a slow sweep never stacks on the next tick.
Deno.cron("scrobble-abuse-sweep", env.SWEEP_CRON, async () => {
  try {
    await runSweep();
  } catch (err) {
    consola.error("[sweep] run failed:", err);
  }
});

if (env.SWEEP_ON_BOOT) {
  runSweep().catch((err) => consola.error("[sweep] boot run failed:", err));
}
