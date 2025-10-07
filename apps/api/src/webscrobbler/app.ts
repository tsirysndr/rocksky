import { ctx } from "context";
import { eq, or } from "drizzle-orm";
import { Hono } from "hono";
import jwt from "jsonwebtoken";
import { env } from "lib/env";
import users from "schema/users";
import webscrobblers from "schema/webscrobblers";
import { v4 as uuid } from "uuid";

const app = new Hono();

app.get("/", async (c) => {
  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  if (!bearer || bearer === "null") {
    c.status(401);
    return c.text("Unauthorized");
  }

  const { did } = jwt.verify(bearer, env.JWT_SECRET, {
    ignoreExpiration: true,
  });

  const user = await ctx.db
    .select()
    .from(users)
    .where(or(eq(users.did, did), eq(users.handle, did)))
    .limit(1)
    .then((rows) => rows[0]);

  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const records = await ctx.db
    .select()
    .from(webscrobblers)
    .leftJoin(users, eq(webscrobblers.userId, users.id))
    .where(eq(users.did, did));

  if (records.length === 0) {
    const [record] = await ctx.db
      .insert(webscrobblers)
      .values({
        uuid: uuid(),
        userId: user.id,
        name: "webscrobbler",
      })
      .returning();
    return c.json(record);
  }

  return c.json(records[0].webscrobblers);
});

app.put("/:id", async (c) => {
  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();
  const id = c.req.param("id");

  if (!bearer || bearer === "null") {
    c.status(401);
    return c.text("Unauthorized");
  }

  const { did } = jwt.verify(bearer, env.JWT_SECRET, {
    ignoreExpiration: true,
  });

  const user = await ctx.db
    .select()
    .from(users)
    .where(or(eq(users.did, did), eq(users.handle, did)))
    .limit(1)
    .then((rows) => rows[0]);

  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  if (
    !id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  ) {
    c.status(400);
    return c.text("Invalid id");
  }

  const existing = await ctx.db
    .select()
    .from(webscrobblers)
    .where(eq(webscrobblers.userId, user.id))
    .limit(1)
    .then((rows) => rows[0]);

  if (existing) {
    const [record] = await ctx.db
      .update(webscrobblers)
      .set({
        uuid: id,
        userId: user.id,
        name: "webscrobbler",
      })
      .where(eq(webscrobblers.id, existing.id))
      .returning();
    return c.json(record);
  } else {
    const [record] = await ctx.db
      .insert(webscrobblers)
      .values({
        uuid: id,
        userId: user.id,
        name: "webscrobbler",
      })
      .returning();
    return c.json(record);
  }
});

export default app;
