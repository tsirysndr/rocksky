import { equals } from "@xata.io/client";
import { ctx } from "context";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import jwt from "jsonwebtoken";
import { env } from "lib/env";
import crypto from "node:crypto";
import * as R from "ramda";
import tables from "schema";
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

  const user = await ctx.client.db.users.filter("did", equals(did)).getFirst();
  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const size = +c.req.query("size") || 20;
  const offset = +c.req.query("offset") || 0;

  const apikeys = await ctx.db
    .select()
    .from(tables.apiKeys)
    .where(eq(tables.apiKeys.userId, user.xata_id))
    .limit(size)
    .offset(offset)
    .execute();

  return c.json(apikeys.map((x) => R.omit(["userId"])(x)));
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

  const user = await ctx.client.db.users.filter("did", equals(did)).getFirst();
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

  const api_key = crypto.randomBytes(16).toString("hex");
  const shared_secret = crypto.randomBytes(16).toString("hex");

  const record = await ctx.client.db.api_keys.create({
    ...newApiKey,
    api_key,
    shared_secret,
    user_id: user.xata_id,
  });

  return c.json({
    id: record.xata_id,
    name: record.name,
    description: record.description,
    api_key: record.api_key,
    shared_secret: record.shared_secret,
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

  const user = await ctx.client.db.users.filter("did", equals(did)).getFirst();
  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const data = await c.req.json();
  const id = c.req.param("id");

  const record = await ctx.db
    .update(tables.apiKeys)
    .set(data)
    .where(
      and(eq(tables.apiKeys.id, id), eq(tables.apiKeys.userId, user.xata_id)),
    )
    .execute();

  return c.json({
    id: record.xata_id,
    name: record.name,
    description: record.description,
    api_key: record.api_key,
    shared_secret: record.shared_secret,
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

  const user = await ctx.client.db.users.filter("did", equals(did)).getFirst();
  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const id = c.req.param("id");

  await ctx.db
    .delete(tables.apiKeys)
    .where(
      and(eq(tables.apiKeys.id, id), eq(tables.apiKeys.userId, user.xata_id)),
    )
    .execute();

  return c.json({ success: true });
});

export default app;
