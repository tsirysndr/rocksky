import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

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
        theme_color: "#ff2876",
        background_color: "#000000",
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
});
