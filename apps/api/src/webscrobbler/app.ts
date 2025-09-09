import { ctx } from "context";
import { eq } from "drizzle-orm";
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

  const user = await ctx.client.db.users
    .filter({
      $any: [{ did }, { handle: did }],
    })
    .getFirst();
  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const records = await ctx.db
    .select()
    .from(webscrobblers)
    .leftJoin(users, eq(webscrobblers.userId, users.id))
    .where(eq(users.did, did))
    .execute();

  if (records.length === 0) {
    const record = await ctx.client.db.webscrobblers.create({
      uuid: uuid(),
      user_id: user.xata_id,
      name: "webscrobbler",
    });
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

  const user = await ctx.client.db.users
    .filter({
      $any: [{ did }, { handle: did }],
    })
    .getFirst();
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

  const existing = await ctx.client.db.webscrobblers
    .filter({ user_id: user.xata_id })
    .getFirst();

  const record = await ctx.client.db.webscrobblers.createOrReplace(
    existing?.xata_id,
    {
      uuid: id,
      user_id: user.xata_id,
      name: "webscrobbler",
    },
  );

  return c.json(record);
});

export default app;
