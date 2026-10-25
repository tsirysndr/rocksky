// The materialized-view refresher: a 30-minute cron and nothing else.
//
// This runs as its own process so it cannot take the XRPC API down with it. A
// refresh is long database work, and node-cron has wedged the event loop it
// shares before now (the October 2026 DST fall-back), which left the HTTP
// server alive but no longer accepting connections.
import "./otel";
import dns from "node:dns";
import { consola } from "consola";
import { pool } from "drizzle";
import cron from "node-cron";

dns.setDefaultResultOrder("ipv4first");

process.on("unhandledRejection", (err) => {
  consola.error("Unhandled rejection:", err);
});
process.on("uncaughtException", (err) => {
  consola.error("Uncaught exception:", err);
});

// UTC so the clock never moves under node-cron: on a DST fall-back the local
// hour repeats, every job reads as overdue and the scheduler spins. The
// expression is a fixed interval, so this does not shift when it fires.
cron.schedule(
  "*/30 * * * *",
  async () => {
    // A concurrent refresh runs far longer than the pool's statement_timeout, so
    // it needs its own client with the cap lifted rather than a pooled query.
    const client = await pool.connect();
    try {
      await client.query("SET statement_timeout = 0");
      for (const view of [
        "user_artists_mv",
        "top_scrobblers_mv",
        "scrobbles_per_day_mv",
        "user_hour_scrobbles_mv",
        "chart_artists_mv",
        "chart_tracks_mv",
      ]) {
        try {
          await client.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${view}`);
          if (view === "user_artists_mv") {
            // A concurrent refresh clears visibility bits on changed pages.
            // Restore index-only neighbour lookups instead of fetching thousands
            // of heap tuples until autovacuum eventually catches up.
            await client.query(
              "VACUUM (ANALYZE, TRUNCATE FALSE) user_artists_mv",
            );
          }
        } catch (err) {
          consola.error(`Failed to refresh ${view}:`, err);
        }
      }
    } catch (err) {
      consola.error("Failed to run materialized view refresh:", err);
    } finally {
      client.release(true);
    }
  },
  { timezone: "UTC" },
);

consola.info("Rocksky materialized view refresher is running");
