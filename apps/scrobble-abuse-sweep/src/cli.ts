// One-shot sweep for manual runs / ops verification: `deno task sweep:once`.
// Honours the same env (set SWEEP_DRY_RUN=true to preview without writing).
import { consola } from "consola";
import { runSweep } from "./sweep.ts";

try {
  await runSweep();
  Deno.exit(0);
} catch (err) {
  consola.error("[sweep] failed:", err);
  Deno.exit(1);
}
