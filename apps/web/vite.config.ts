import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react-swc";
import { cpSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// rockbox-wasm's runtime (core + decoder worker + audio worklet) is fetched by
// URL at runtime, so it can't go through the module graph. Mirror the package
// dist into public/rockbox — served at /rockbox/*, which is the RockboxPlayer
// baseUrl (see src/lib/audio/rockbox-engine.ts). Vite then copies public/ into
// the build output, so the assets ship at dist/rockbox/* for production.
//
// Resolve via createRequire (works on every Node version + in CI) rather than
// import.meta.resolve, whose sync form is only stable on Node 20.6+ — an older
// CI Node would otherwise silently skip the copy and 404 the worklet in prod.
const require = createRequire(import.meta.url);
// Resolve the exported ./dist/* subpath (require can't resolve "." — the
// package only exposes an `import` condition, not `require`).
const rockboxDist = dirname(require.resolve("rockbox-wasm/dist/rockbox.js"));
cpSync(
  rockboxDist,
  fileURLToPath(new URL("./public/rockbox", import.meta.url)),
  { recursive: true },
);

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
  ],
  optimizeDeps: {
    force: true,
    // Don't prebundle rockbox-wasm: it resolves its worker/worklet via
    // `new URL("./file", import.meta.url)`, which esbuild's prebundle would
    // rewrite incorrectly. Served as-is, the ESM facade loads them at runtime.
    exclude: ["rockbox-wasm"],
  },
});
