import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react-swc";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

// Desktop (Tauri) build of the Rocksky web app. Differences from apps/web:
// - no PWA/service worker (the shell is a native window);
// - `rockbox-wasm` is aliased to the Tauri adapter, which implements the same
//   RockboxPlayer surface over the native rockbox-playback engine instead of
//   the in-browser WebAssembly one (see src/lib/tauri-rockbox/index.ts).
export default defineConfig({
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "rockbox-wasm": fileURLToPath(
        new URL("./src/lib/tauri-rockbox/index.ts", import.meta.url),
      ),
    },
  },
  // Tauri dev conventions: fixed port, don't clear the terminal, and let
  // TAURI_ENV_* vars reach the client bundle when needed.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_ENV_"],
});
