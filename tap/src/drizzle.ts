import { drizzle } from "drizzle-orm/libsql";

const db = drizzle({
  connection: {
    url: Deno.env.get("TAP_CACHE_DATABASE_URL") || "file:tap-cache.db",
  },
});

export default { db };
