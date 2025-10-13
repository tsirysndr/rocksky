import { ctx, db } from "context";
import { refreshSessionsAboutToExpire, updateExpiresAt } from "db";
import { env } from "lib/env";
import cron from "node-cron";

console.log("DB Path:", env.DB_PATH);

await updateExpiresAt(db);

await refreshSessionsAboutToExpire(db, ctx);

// run every 1 minute
cron.schedule("* * * * *", async () => {
  console.log("Running session refresh job...");
  await refreshSessionsAboutToExpire(db, ctx);
});
