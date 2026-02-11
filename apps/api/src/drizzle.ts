import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "lib/env";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: env.XATA_POSTGRES_URL,
  max: 20,
  idleTimeoutMillis: 10 * 1000 * 60,
});
const db = drizzle(pool);

export default { db };
