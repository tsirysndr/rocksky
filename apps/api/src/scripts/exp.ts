import { consola } from "consola";
import { ctx, db } from "context";
import { refreshSessionsAboutToExpire, updateExpiresAt } from "db";
import { env } from "lib/env";
import cron from "node-cron";

consola.info("DB Path:", env.DB_PATH);

await updateExpiresAt(db);

await refreshSessionsAboutToExpire(db, ctx);

// run every 1 minute
cron.schedule("* * * * *", async () => {
  consola.info("Running session refresh job...");
  await refreshSessionsAboutToExpire(db, ctx);
});
