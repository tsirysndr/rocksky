import { compiledTui } from "../tui/compiled.js";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Keep command-line reads on Node; only the native OpenTUI session needs Bun. */
export async function tui(opts: { output?: string } = {}) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("The Rocksky TUI requires an interactive terminal.");
  }
  const embedded = compiledTui();
  if (embedded) return embedded(opts);
  const entry = [
    new URL("./tui.mjs", import.meta.url),
    new URL("../tui/launch.js", import.meta.url),
  ].find(existsSync);
  if (!entry)
    throw new Error("OpenTUI bundle is missing. Rebuild the Rocksky CLI.");
  if ("Bun" in globalThis) {
    const ui = await import(entry.href);
    return ui.tui(opts);
  }
  const child = spawnSync(
    "bun",
    [fileURLToPath(entry), ...(opts.output ? ["--output", opts.output] : [])],
    { stdio: "inherit" },
  );
  if (child.error)
    throw new Error(
      "The interactive player needs Bun >=1.3.14. Install Bun, then run rocksky again.",
      { cause: child.error },
    );
  process.exitCode = child.status ?? 1;
}
