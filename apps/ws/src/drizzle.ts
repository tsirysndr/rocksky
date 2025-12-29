import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: Deno.env.get("XATA_POSTGRES_URL"),
  max: 20,
});
const db = drizzle(pool);

export default { db };
