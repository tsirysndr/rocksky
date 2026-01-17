import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";

const client = createClient({
  url: Deno.env.get("TAP_CACHE_DATABASE_URL") || "file:tap-cache.db",
});

await client.execute("PRAGMA journal_mode = WAL;");
await client.execute("PRAGMA busy_timeout = 5000;");
await client.execute("PRAGMA synchronous = NORMAL;");
await client.execute("PRAGMA cache_size = -10000;");

const db = drizzle(client);

export default { db };
