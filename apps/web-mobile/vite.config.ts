import tailwindcss from "@tailwindcss/vite";
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

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "favicon.png", "icon-192x192.png", "icon-512x512.png"],
      manifest: {
        name: "Rocksky",
        short_name: "Rocksky",
        description: "Music scrobbling for Bluesky",
        theme_color: "#130825",
        background_color: "#130825",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "/icon-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        navigateFallback: "/index.html",
        // Deny service worker fallback for routes handled by the app-proxy:
        // /oauth/callback is the AT Protocol OAuth redirect URI — must reach the API, not index.html
        // /login proxies to the API login endpoint
        navigateFallbackDenylist: [/^\/api\//, /^\/oauth\//, /^\/login/],
        runtimeCaching: [
          {
            // Exclude auth-sensitive endpoints (/token, /login, /oauth) from caching.
            // Cache key is URL-only so caching /token would ignore the session-did header.
            urlPattern: /^https:\/\/api\.rocksky\.app\/(?!token|login|oauth).*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 5 },
              networkTimeoutSeconds: 10,
            },
          },
        ],
      },
    }),
  ],
  optimizeDeps: {
    // Don't prebundle rockbox-wasm: it resolves its worker/worklet via
    // `new URL("./file", import.meta.url)`, which esbuild's prebundle would
    // rewrite incorrectly. Served as-is, the ESM facade loads them at runtime.
    exclude: ["rockbox-wasm"],
  },
});
