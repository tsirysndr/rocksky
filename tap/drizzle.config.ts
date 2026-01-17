import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema",
  dbCredentials: {
    url: Deno.env.get("TAP_CACHE_DATABASE_URL") || "tap-cache.db",
  },
});
