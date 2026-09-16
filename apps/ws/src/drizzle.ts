import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: Deno.env.get("XATA_POSTGRES_URL"),
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  application_name: "rocksky-ws",
  // Nothing else reclaims a backend whose caller has already given up.
  statement_timeout: 60_000,
  idle_in_transaction_session_timeout: 30_000,
});

pool.on("error", (err: Error) => {
  console.error(
    "Idle pg client error (connection terminated by server):",
    err.message,
  );
});

const db = drizzle(pool);

export default { db };
