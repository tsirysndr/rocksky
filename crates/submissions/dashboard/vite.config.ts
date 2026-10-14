import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  base: "/dashboard/",
  plugins: [react(), tailwindcss()],
  server: { proxy: { "/v1": "http://127.0.0.1:8098" } },
  build: { sourcemap: false },
  test: { environment: "jsdom", restoreMocks: true },
});
