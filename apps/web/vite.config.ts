import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react-swc";
import { cpSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

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
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.ico",
        "favicon.png",
        "icon-192x192.png",
        "icon-512x512.png",
      ],
      manifest: {
        name: "Rocksky",
        short_name: "Rocksky",
        description: "Music scrobbling for Bluesky",
        // Window / splash colours match the app's default (dark) background —
        // the running app keeps <meta name="theme-color"> in sync with the
        // active light/dark theme (see src/routes/__root.tsx).
        theme_color: "#130825",
        background_color: "#130825",
        display: "standalone",
        scope: "/",
        start_url: "/",
        icons: [
          { src: "/icon-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      workbox: {
        // rockbox-core.js is ~1.5 MB — raise the precache size ceiling.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2,otf}"],
        navigateFallback: "/index.html",
        // These paths are handled by the app-proxy (OAuth / auth endpoints) —
        // never answer them with the SPA shell.
        navigateFallbackDenylist: [
          /^\/oauth/,
          /^\/login/,
          /^\/token/,
          /^\/jwks\.json/,
          /^\/oauth-client-metadata\.json/,
        ],
      },
    }),
  ],
  optimizeDeps: {
    force: true,
    // Don't prebundle rockbox-wasm: it resolves its worker/worklet via
    // `new URL("./file", import.meta.url)`, which esbuild's prebundle would
    // rewrite incorrectly. Served as-is, the ESM facade loads them at runtime.
    exclude: ["rockbox-wasm"],
  },
});
