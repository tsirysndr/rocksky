import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { consola } from "consola";
import { ctx } from "context";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import jwt from "jsonwebtoken";
import { env } from "lib/env";
import { parseBuffer } from "music-metadata";
import { createHash } from "node:crypto";
import tables from "schema";

// ---------------------------------------------------------------------------
// Allowed audio MIME types
// ---------------------------------------------------------------------------

const ALLOWED_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/flac",
  "audio/mp4",
  "audio/x-m4a",
  "audio/ogg",
  "audio/wav",
  "audio/x-wav",
  "audio/aiff",
  "audio/x-aiff",
]);

const MIME_TO_EXT: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/flac": "flac",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/aiff": "aiff",
  "audio/x-aiff": "aiff",
};

// ---------------------------------------------------------------------------
// Magic-byte signatures for format detection (don't trust Content-Type)
// ---------------------------------------------------------------------------

const MAGIC: Array<{ bytes: number[]; mime: string }> = [
  { bytes: [0x49, 0x44, 0x33], mime: "audio/mpeg" },       // ID3 tag → MP3
  { bytes: [0xff, 0xfb], mime: "audio/mpeg" },              // MPEG frame sync
  { bytes: [0xff, 0xf3], mime: "audio/mpeg" },
  { bytes: [0xff, 0xf2], mime: "audio/mpeg" },
  { bytes: [0x66, 0x4c, 0x61, 0x43], mime: "audio/flac" }, // fLaC
  { bytes: [0x4f, 0x67, 0x67, 0x53], mime: "audio/ogg" },  // OggS
  { bytes: [0x52, 0x49, 0x46, 0x46], mime: "audio/wav" },  // RIFF → WAV
  { bytes: [0x46, 0x4f, 0x52, 0x4d], mime: "audio/aiff" }, // FORM → AIFF
  // M4A / MP4 — ftyp box at offset 4
];

function detectMime(buf: Buffer): string | null {
  for (const sig of MAGIC) {
    if (sig.bytes.every((b, i) => buf[i] === b)) return sig.mime;
  }
  // M4A: bytes 4-7 are "ftyp"
  if (
    buf[4] === 0x66 &&
    buf[5] === 0x74 &&
    buf[6] === 0x79 &&
    buf[7] === 0x70
  ) {
    return "audio/mp4";
  }
  return null;
}

// ---------------------------------------------------------------------------
// S3-compatible client (provider-agnostic via env vars)
// ---------------------------------------------------------------------------

function makeS3Client(): S3Client {
  return new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
  });
}

// ---------------------------------------------------------------------------
// Auth helper — resolves JWT → user row (DRY across handlers)
// ---------------------------------------------------------------------------

async function resolveUser(authHeader: string | undefined | null) {
  const bearer = (authHeader || "").split(" ")[1]?.trim();
  if (!bearer || bearer === "null") return null;
  const { did } = jwt.verify(bearer, env.JWT_SECRET, {
    ignoreExpiration: true,
  }) as { did: string };
  return ctx.db
    .select()
    .from(tables.users)
    .where(eq(tables.users.did, did))
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const app = new Hono();

// POST /uploads/track --------------------------------------------------------
// Accepts multipart/form-data with a single "file" field.
// Pipeline:
//   1. JWT auth
//   2. Magic-byte MIME check → reject non-audio
//   3. music-metadata parse
//   4. Completeness check (title + artist + album required)
//   5. SHA-256 dedup
//   6. Upsert track row
//   7. PUT to S3-compatible storage
//   8. Insert user_uploads record
app.post("/track", async (c) => {
  const user = await resolveUser(c.req.header("authorization"));
  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    c.status(400);
    return c.text("Invalid multipart form data");
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    c.status(400);
    return c.json({ error: "NO_FILE", message: "No file provided" });
  }

  const buf = Buffer.from(await file.arrayBuffer());

  // --- Format validation (magic bytes) ---
  const mime = detectMime(buf);
  if (!mime || !ALLOWED_MIME_TYPES.has(mime)) {
    c.status(400);
    return c.json({
      error: "INVALID_FORMAT",
      message:
        "Only audio files are accepted (MP3, FLAC, M4A, OGG, WAV, AIFF)",
    });
  }

  // --- Metadata extraction ---
  let metadata: Awaited<ReturnType<typeof parseBuffer>>;
  try {
    metadata = await parseBuffer(buf, { mimeType: mime });
  } catch (e) {
    consola.error("[uploads] metadata parse error", e);
    c.status(422);
    return c.json({
      error: "METADATA_PARSE_FAILED",
      message: "Could not read audio tags from this file",
    });
  }

  const { common, format } = metadata;

  // --- Completeness check ---
  const missing: string[] = [];
  if (!common.title?.trim()) missing.push("title");
  if (!common.artist?.trim()) missing.push("artist");
  if (!common.album?.trim()) missing.push("album");

  if (missing.length > 0) {
    c.status(422);
    return c.json({
      error: "INCOMPLETE_METADATA",
      message: `Missing required tags: ${missing.join(", ")}. Please tag your file before uploading.`,
      missingFields: missing,
    });
  }

  // --- Dedup by SHA-256 ---
  const sha256 = createHash("sha256").update(buf).digest("hex");
  const ext = MIME_TO_EXT[mime] ?? "bin";
  const storageKey = `music/${user.id}/${sha256}.${ext}`;

  const existingUpload = await ctx.db
    .select()
    .from(tables.userUploads)
    .where(
      and(
        eq(tables.userUploads.userId, user.id),
        eq(tables.userUploads.r2Key, storageKey),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (existingUpload) {
    c.status(409);
    return c.json({
      error: "DUPLICATE_FILE",
      message: "This file is already in your library",
      uploadId: existingUpload.id,
    });
  }

  // --- Upsert track (global dedup by sha256) ---
  let track = await ctx.db
    .select()
    .from(tables.tracks)
    .where(eq(tables.tracks.sha256, sha256))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!track) {
    const duration = format.duration ? Math.round(format.duration) : 0;
    [track] = await ctx.db
      .insert(tables.tracks)
      .values({
        title: common.title!.trim(),
        artist: common.artist!.trim(),
        albumArtist: common.albumartist?.trim() || common.artist!.trim(),
        album: common.album!.trim(),
        trackNumber: common.track?.no ?? null,
        discNumber: common.disk?.no ?? null,
        duration,
        genre: common.genre?.[0] ?? null,
        composer: common.composer?.[0] ?? null,
        sha256,
        uri: `at://did:rocksky:local/${sha256}`,
      })
      .returning();
  }

  // --- Upload to storage ---
  const s3 = makeS3Client();
  await s3.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET_NAME,
      Key: storageKey,
      Body: buf,
      ContentType: mime,
      ContentLength: buf.length,
      Metadata: {
        userId: user.id,
        trackId: track.id,
        originalFilename: file.name,
      },
    }),
  );

  // --- Index upload ---
  const [upload] = await ctx.db
    .insert(tables.userUploads)
    .values({
      userId: user.id,
      trackId: track.id,
      r2Key: storageKey,
      mimeType: mime,
      fileSize: buf.length,
      originalFilename: file.name,
    })
    .returning();

  return c.json({
    uploadId: upload.id,
    trackId: track.id,
    track: {
      title: track.title,
      artist: track.artist,
      album: track.album,
      duration: track.duration,
      genre: track.genre,
    },
  });
});

// GET /uploads ---------------------------------------------------------------
// Returns the authenticated user's uploaded tracks (paginated).
app.get("/", async (c) => {
  const user = await resolveUser(c.req.header("authorization"));
  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const size = Math.min(+c.req.query("size") || 50, 200);
  const offset = +c.req.query("offset") || 0;

  const uploads = await ctx.db
    .select({ upload: tables.userUploads, track: tables.tracks })
    .from(tables.userUploads)
    .innerJoin(tables.tracks, eq(tables.userUploads.trackId, tables.tracks.id))
    .where(eq(tables.userUploads.userId, user.id))
    .orderBy(desc(tables.userUploads.uploadedAt))
    .limit(size)
    .offset(offset);

  return c.json(uploads);
});

// GET /uploads/:id/stream ----------------------------------------------------
// Returns a short-lived presigned URL for streaming the audio file.
// The <audio> element can use it directly with range-request support.
app.get("/:id/stream", async (c) => {
  const user = await resolveUser(c.req.header("authorization"));
  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const upload = await ctx.db
    .select()
    .from(tables.userUploads)
    .where(
      and(
        eq(tables.userUploads.id, c.req.param("id")),
        eq(tables.userUploads.userId, user.id),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!upload) {
    c.status(404);
    return c.text("Upload not found");
  }

  const s3 = makeS3Client();
  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: env.S3_BUCKET_NAME,
      Key: upload.r2Key,
    }),
    { expiresIn: 3600 },
  );

  return c.json({ url, expiresIn: 3600 });
});

// DELETE /uploads/:id --------------------------------------------------------
// Deletes the file from storage and removes the DB record. Owner-only.
app.delete("/:id", async (c) => {
  const user = await resolveUser(c.req.header("authorization"));
  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const upload = await ctx.db
    .select()
    .from(tables.userUploads)
    .where(
      and(
        eq(tables.userUploads.id, c.req.param("id")),
        eq(tables.userUploads.userId, user.id),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!upload) {
    c.status(404);
    return c.text("Upload not found");
  }

  const s3 = makeS3Client();
  await s3.send(
    new DeleteObjectCommand({
      Bucket: env.S3_BUCKET_NAME,
      Key: upload.r2Key,
    }),
  );

  await ctx.db
    .delete(tables.userUploads)
    .where(eq(tables.userUploads.id, upload.id));

  return c.json({ status: "ok" });
});

export default app;
