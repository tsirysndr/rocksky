import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "./utils/env.ts";
import pg from "pg";

// Read-only service: the replica if there is one, otherwise the read+write
// endpoint.
const pool = new pg.Pool({
  connectionString: env.XATA_READ_POSTGRES_URL || env.XATA_POSTGRES_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  application_name: "rocksky-feeds:replica",
  // Nothing else reclaims a backend whose caller has already given up.
  statement_timeout: 60_000,
  idle_in_transaction_session_timeout: 30_000,
});

pool.on("error", (err) => {
  console.error(
    "Idle pg client error (connection terminated by server):",
    err.message,
  );
});

const db = drizzle(pool);

export default { db };
