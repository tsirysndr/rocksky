import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
export const run = async (output) => {
  if (!process.stdin.isTTY) {
    console.error("The Rocksky TUI requires an interactive terminal.");
    process.exitCode = 1;
    return;
  }
  const candidates = [
    new URL("./tui.mjs", import.meta.url),
    new URL("../../../../../cli/dist/tui.mjs", import.meta.url),
  ];
  const bundle = candidates.find((url) => fs.existsSync(url));
  if (!bundle)
    throw new Error("OpenTUI bundle is missing. Run bun run build:cli.");
  if (!globalThis.Bun) {
    const child = spawnSync(
      "bun",
      [fileURLToPath(bundle), ...(output ? ["--output", output] : [])],
      { stdio: "inherit" },
    );
    if (child.error)
      throw new Error("The interactive player requires Bun >=1.3.14.", {
        cause: child.error,
      });
    process.exitCode = child.status ?? 1;
    return;
  }
  const { tui } = await import(bundle.href);
  await tui(output ? { output } : {});
};
