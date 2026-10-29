import { Hono } from "hono";
import { ctx } from "../context";
import { pool } from "../drizzle";
import { eq } from "drizzle-orm";
import { verifyToken } from "../lib/verifyToken";
import users from "../schema/users";
import { saveDevice } from "./push-runtime.mjs";

const app = new Hono();
for (const [path, remove] of [["/devices", false], ["/devices/remove", true]] as const) {
  app.post(path, async c => {
    const token = c.req.header("authorization")?.match(/^Bearer (.+)$/i)?.[1];
    let did: string | undefined;
    try { did = token ? (await verifyToken(token)).did : undefined; } catch {}
    if (!did) return c.text("Unauthorized", 401);
    const [user] = await ctx.db.select({id:users.id}).from(users).where(eq(users.did,did)).limit(1);
    if (!user) return c.text("Unauthorized", 401);
    const body = await c.req.json().catch(() => null);
    if (typeof body?.token !== "string" || !body.token.length || body.token.length > 4096) {
      return c.text("Invalid device token", 400);
    }
    await saveDevice({pool}, user.id, body.token, remove);
    return c.json({status:"ok"});
  });
}
export default app;
