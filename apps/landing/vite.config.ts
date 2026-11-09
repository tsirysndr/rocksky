import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  // Bun links local SDK files back to their source checkout. Resolve their
  // dependencies from this app's node_modules, where Bun installs them.
  resolve: { preserveSymlinks: true },
  base: command === "build" ? "/_landing/" : "/",
}));
