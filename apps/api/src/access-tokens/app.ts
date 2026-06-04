import { ctx } from "context";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import jwt from "jsonwebtoken";
import { env } from "lib/env";
import { encryptCredential } from "lib/storage-crypto";
import { ACCESS_TOKEN_TYPE, verifyToken } from "lib/verifyToken";
import { randomUUID } from "node:crypto";
import accessTokens from "schema/access-tokens";
import users from "schema/users";
import { createAccessTokenSchema } from "types/access-token";

const app = new Hono();

async function authenticate(authHeader: string | undefined) {
  const bearer = (authHeader || "").split(" ")[1]?.trim();
  if (!bearer || bearer === "null") return null;
  try {
    const { did } = await verifyToken(bearer);
    if (!did) return null;
    return ctx.db
      .select()
      .from(users)
      .where(eq(users.did, did))
      .limit(1)
      .then((rows) => rows[0] ?? null);
  } catch {
    return null;
  }
}

// GET / — list the caller's access tokens (metadata only, never the secret).
app.get("/", async (c) => {
  const user = await authenticate(c.req.header("authorization"));
  if (!user) return c.text("Unauthorized", 401);

  const size = Math.min(+c.req.query("size") || 50, 200);
  const offset = Math.max(+c.req.query("offset") || 0, 0);

  const rows = await ctx.db
    .select({
      id: accessTokens.id,
      name: accessTokens.name,
      lastFour: accessTokens.lastFour,
      lastUsedAt: accessTokens.lastUsedAt,
      createdAt: accessTokens.createdAt,
      updatedAt: accessTokens.updatedAt,
    })
    .from(accessTokens)
    .where(eq(accessTokens.userId, user.id))
    .orderBy(desc(accessTokens.createdAt))
    .limit(size)
    .offset(offset);

  return c.json(rows);
});

// POST / — issue a new long-lived JWT and return the plaintext exactly once.
app.post("/", async (c) => {
  const user = await authenticate(c.req.header("authorization"));
  if (!user) return c.text("Unauthorized", 401);

  const body = await c.req.json().catch(() => ({}));
  const parsed = createAccessTokenSchema.safeParse(body);
  if (!parsed.success) {
    return c.text(`Invalid input: ${parsed.error.message}`, 400);
  }

  const jti = randomUUID();
  const token = jwt.sign(
    {
      did: user.did,
      jti,
      type: ACCESS_TOKEN_TYPE,
      iat: Math.floor(Date.now() / 1000),
    },
    env.JWT_SECRET,
  );

  const tokenEncrypted = await encryptCredential(token);
  const lastFour = token.slice(-4);

  const [record] = await ctx.db
    .insert(accessTokens)
    .values({
      userId: user.id,
      name: parsed.data.name,
      jti,
      tokenEncrypted,
      lastFour,
    })
    .returning({
      id: accessTokens.id,
      name: accessTokens.name,
      lastFour: accessTokens.lastFour,
      lastUsedAt: accessTokens.lastUsedAt,
      createdAt: accessTokens.createdAt,
      updatedAt: accessTokens.updatedAt,
    });

  return c.json({
    ...record,
    token,
  });
});

// DELETE /:id — revoke the token. verifyToken's DB check rejects future use.
app.delete("/:id", async (c) => {
  const user = await authenticate(c.req.header("authorization"));
  if (!user) return c.text("Unauthorized", 401);

  const id = c.req.param("id");
  const deleted = await ctx.db
    .delete(accessTokens)
    .where(and(eq(accessTokens.id, id), eq(accessTokens.userId, user.id)))
    .returning({ id: accessTokens.id });

  if (deleted.length === 0) return c.text("Not found", 404);
  return c.json({ success: true });
});

export default app;
