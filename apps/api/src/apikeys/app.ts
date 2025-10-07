import { ctx } from "context";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import jwt from "jsonwebtoken";
import { env } from "lib/env";
import crypto from "node:crypto";
import * as R from "ramda";
import apiKeys from "schema/api-keys";
import users from "schema/users";
import { apiKeySchema } from "types/apikey";

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
    .where(eq(users.did, did))
    .limit(1)
    .then((rows) => rows[0]);

  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const size = +c.req.query("size") || 20;
  const offset = +c.req.query("offset") || 0;

  const apikeysData = await ctx.db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.userId, user.id))
    .limit(size)
    .offset(offset);

  return c.json(apikeysData.map((x) => R.omit(["userId"])(x)));
});

app.post("/", async (c) => {
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
    .where(eq(users.did, did))
    .limit(1)
    .then((rows) => rows[0]);

  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const body = await c.req.json();
  const parsed = apiKeySchema.safeParse(body);

  if (parsed.error) {
    c.status(400);
    return c.text("Invalid api key data: " + parsed.error.message);
  }
  const newApiKey = parsed.data;

  if (!newApiKey.name) {
    c.status(400);
    return c.text("Missing required field: name");
  }

  const apiKey = crypto.randomBytes(16).toString("hex");
  const sharedSecret = crypto.randomBytes(16).toString("hex");

  const [record] = await ctx.db
    .insert(apiKeys)
    .values({
      name: newApiKey.name,
      description: newApiKey.description ?? "",
      enabled: newApiKey.enabled ?? true,
      apiKey,
      sharedSecret,
      userId: user.id,
    })
    .returning();

  return c.json({
    id: record.id,
    name: record.name,
    description: record.description,
    api_key: record.apiKey,
    shared_secret: record.sharedSecret,
  });
});

app.put("/:id", async (c) => {
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
    .where(eq(users.did, did))
    .limit(1)
    .then((rows) => rows[0]);

  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const data = await c.req.json();
  const id = c.req.param("id");

  const [record] = await ctx.db
    .update(apiKeys)
    .set(data)
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, user.id)))
    .returning();

  return c.json({
    id: record.id,
    name: record.name,
    description: record.description,
    api_key: record.apiKey,
    shared_secret: record.sharedSecret,
  });
});

app.delete("/:id", async (c) => {
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
    .where(eq(users.did, did))
    .limit(1)
    .then((rows) => rows[0]);

  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const id = c.req.param("id");

  await ctx.db
    .delete(apiKeys)
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, user.id)));

  return c.json({ success: true });
});

export default app;
