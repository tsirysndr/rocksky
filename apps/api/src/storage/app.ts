import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { ctx } from "context";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { env } from "lib/env";
import { decryptCredential, encryptCredential } from "lib/storage-crypto";
import { verifyToken } from "lib/verifyToken";
import tables from "schema";

const app = new Hono();

async function resolveUser(authHeader: string | undefined | null) {
  const bearer = (authHeader || "").split(" ")[1]?.trim();
  if (!bearer || bearer === "null") return null;
  const { did } = await verifyToken(bearer) as { did: string };
  return ctx.db
    .select()
    .from(tables.users)
    .where(eq(tables.users.did, did))
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

// POST /storage/providers --------------------------------------------------------
// Validates S3 connectivity before persisting. Credentials are encrypted at rest.
app.post("/providers", async (c) => {
  const user = await resolveUser(c.req.header("authorization"));
  if (!user) return c.text("Unauthorized", 401);

  let body: {
    label: string;
    endpoint: string;
    region?: string;
    bucket: string;
    access_key: string;
    secret_key: string;
    public_url?: string;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.text("Invalid JSON", 400);
  }

  const {
    label,
    endpoint,
    region = "auto",
    bucket,
    access_key,
    secret_key,
    public_url,
  } = body;

  if (!label || !endpoint || !bucket || !access_key || !secret_key) {
    return c.text(
      "Missing required fields: label, endpoint, bucket, access_key, secret_key",
      400,
    );
  }

  const client = new S3Client({
    region,
    endpoint,
    credentials: { accessKeyId: access_key, secretAccessKey: secret_key },
  });

  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : "Failed to connect to S3 bucket";
    return c.json({ error: "CONNECTIVITY_FAILED", message }, 422);
  }

  const [encryptedAccessKey, encryptedSecretKey] = await Promise.all([
    encryptCredential(access_key),
    encryptCredential(secret_key),
  ]);

  const [provider] = await ctx.db
    .insert(tables.userStorageProviders)
    .values({
      userId: user.id,
      label,
      endpoint,
      region,
      bucket,
      accessKey: encryptedAccessKey,
      secretKey: encryptedSecretKey,
      publicUrl: public_url ?? null,
      verifiedAt: new Date(),
    })
    .returning();

  return c.json(
    {
      id: provider.id,
      label: provider.label,
      endpoint: provider.endpoint,
      region: provider.region,
      bucket: provider.bucket,
      public_url: provider.publicUrl,
      verified_at: provider.verifiedAt,
      created_at: provider.createdAt,
    },
    201,
  );
});

// GET /storage/providers ---------------------------------------------------------
app.get("/providers", async (c) => {
  const user = await resolveUser(c.req.header("authorization"));
  if (!user) return c.text("Unauthorized", 401);

  const providers = await ctx.db
    .select({
      id: tables.userStorageProviders.id,
      label: tables.userStorageProviders.label,
      endpoint: tables.userStorageProviders.endpoint,
      region: tables.userStorageProviders.region,
      bucket: tables.userStorageProviders.bucket,
      public_url: tables.userStorageProviders.publicUrl,
      verified_at: tables.userStorageProviders.verifiedAt,
      created_at: tables.userStorageProviders.createdAt,
    })
    .from(tables.userStorageProviders)
    .where(eq(tables.userStorageProviders.userId, user.id));

  return c.json(providers);
});

// DELETE /storage/providers/:id --------------------------------------------------
app.delete("/providers/:id", async (c) => {
  const user = await resolveUser(c.req.header("authorization"));
  if (!user) return c.text("Unauthorized", 401);

  const providerId = c.req.param("id");

  const [provider] = await ctx.db
    .select()
    .from(tables.userStorageProviders)
    .where(
      and(
        eq(tables.userStorageProviders.id, providerId),
        eq(tables.userStorageProviders.userId, user.id),
      ),
    )
    .limit(1);

  if (!provider) return c.text("Not found", 404);

  const [referencingUpload] = await ctx.db
    .select({ id: tables.userUploads.id })
    .from(tables.userUploads)
    .where(eq(tables.userUploads.storageProviderId, providerId))
    .limit(1);

  if (referencingUpload) {
    return c.json(
      {
        error: "PROVIDER_IN_USE",
        message:
          "Cannot delete a storage provider that has uploads referencing it",
      },
      409,
    );
  }

  await ctx.db
    .delete(tables.userStorageProviders)
    .where(eq(tables.userStorageProviders.id, providerId));

  return new Response(null, { status: 204 });
});

// providerId = null  → use Rocksky managed storage
// providerId = string → use the specified BYO provider (must belong to userId)
export async function resolveStorageClient(
  userId: string,
  providerId: string | null,
): Promise<{
  client: S3Client;
  bucket: string;
  storageProviderId: string | null;
}> {
  if (!providerId) {
    return {
      client: new S3Client({
        region: env.S3_REGION,
        endpoint: env.S3_ENDPOINT,
        credentials: {
          accessKeyId: env.S3_ACCESS_KEY_ID,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        },
      }),
      bucket: env.S3_BUCKET_NAME,
      storageProviderId: null,
    };
  }

  const [provider] = await ctx.db
    .select()
    .from(tables.userStorageProviders)
    .where(
      and(
        eq(tables.userStorageProviders.id, providerId),
        eq(tables.userStorageProviders.userId, userId),
      ),
    )
    .limit(1);

  if (!provider) {
    throw new Error(`Storage provider ${providerId} not found for user`);
  }

  const [accessKey, secretKey] = await Promise.all([
    decryptCredential(provider.accessKey),
    decryptCredential(provider.secretKey),
  ]);

  return {
    client: new S3Client({
      region: provider.region,
      endpoint: provider.endpoint,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    }),
    bucket: provider.bucket,
    storageProviderId: provider.id,
  };
}

export default app;
