import { consola } from "consola";
import { existsSync, readdirSync, realpathSync, statSync } from "fs";
import { join } from "path";
import { $ } from "zx";

/**
 * Recursively collect every `.json` lexicon under `dir`.
 */
function collectLexicons(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectLexicons(full));
    } else if (entry.endsWith(".json")) {
      out.push(full);
    }
  }
  return out;
}

const ROOTS = ["lexicons", "src/tealfm/lexicons"];
const OUT_DIR = "./src/lexicon";

// De-duplicate by real path. The previous glob command
// (`./lexicons/**/* ./lexicons/* ./src/tealfm/lexicons/teal/**/* ./src/tealfm/lexicons/**/*`)
// matched several files twice — `**/*` already covers `*`, and the two tealfm
// globs overlap — which made lex-cli throw "<id> has already been registered"
// and abort mid-run (leaving stale/deleted generated files). A unique list
// avoids that entirely.
const files = [
  ...new Set(
    ROOTS.filter((root) => existsSync(root))
      .flatMap((root) => collectLexicons(root))
      .map((f) => realpathSync(f)),
  ),
];

// Prefer a locally-installed lex binary; fall back to the pinned package via
// bunx so the script works even when node_modules isn't fully populated. The
// version must match the one in package.json (`@atproto/lex-cli`) — newer
// majors emit a completely different output shape.
const lex = existsSync("node_modules/.bin/lex")
  ? ["node_modules/.bin/lex"]
  : ["bunx", "@atproto/lex-cli@0.5.7"];

consola.info(`Generating server API from ${files.length} lexicons…`);
await $`${lex} gen-server ${OUT_DIR} --yes ${files}`;

// lex-cli emits single-quote code with plain `import`/empty `interface`.
// Normalise to the repo's committed style: `biome format` handles quotes &
// semicolons, then `biome lint --write` applies the safe style fixes
// (useImportType → `import type`, noEmptyInterface → `type X = {}`). We use
// `lint` rather than `check` on purpose: `check` would also run the
// organizeImports assist and reorder every import block.
consola.info("Normalising generated code with Biome…");
await $`npx biome format --write ${OUT_DIR}`;
await $`npx biome lint --write ${OUT_DIR}`.nothrow();

consola.success(`Generated ${files.length} lexicons into ${OUT_DIR}`);
