import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { consola } from "consola";
import { ctx } from "context";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { resolveStorageClient } from "storage/app";
import { Hono } from "hono";
import jwt from "jsonwebtoken";
import { createAgent } from "lib/agent";
import { env } from "lib/env";
import { parseBuffer } from "music-metadata";
import { createHash } from "node:crypto";
import tables from "schema";
import { saveTrack } from "tracks/tracks.service";
import {
  indexLibraryTrack,
  removeLibraryTrack,
  searchLibraryTracks,
} from "typesense/library";

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

const PICTURE_MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/bmp": "bmp",
  "image/tiff": "tiff",
};

// ---------------------------------------------------------------------------
// Magic-byte signatures for format detection (don't trust Content-Type)
// ---------------------------------------------------------------------------

const MAGIC: Array<{ bytes: number[]; mime: string }> = [
  { bytes: [0x49, 0x44, 0x33], mime: "audio/mpeg" }, // ID3 tag → MP3
  { bytes: [0xff, 0xfb], mime: "audio/mpeg" }, // MPEG frame sync
  { bytes: [0xff, 0xf3], mime: "audio/mpeg" },
  { bytes: [0xff, 0xf2], mime: "audio/mpeg" },
  { bytes: [0x66, 0x4c, 0x61, 0x43], mime: "audio/flac" }, // fLaC
  { bytes: [0x4f, 0x67, 0x67, 0x53], mime: "audio/ogg" }, // OggS
  { bytes: [0x52, 0x49, 0x46, 0x46], mime: "audio/wav" }, // RIFF → WAV
  { bytes: [0x46, 0x4f, 0x52, 0x4d], mime: "audio/aiff" }, // FORM → AIFF
];

function detectMime(buf: Buffer): string | null {
  for (const sig of MAGIC) {
    if (sig.bytes.every((b, i) => buf[i] === b)) return sig.mime;
  }
  // M4A / MP4: ftyp box starts at byte 4
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
// SHA-256 — computed from metadata, matching the Dropbox/Google Drive crates:
//   sha256("{title} - {artist} - {album}".to_lowercase())
// This ensures the same track is deduplicated across all ingestion sources.
// ---------------------------------------------------------------------------

function metaSha256(title: string, artist: string, album: string): string {
  return createHash("sha256")
    .update(`${title} - ${artist} - ${album}`.toLowerCase())
    .digest("hex");
}

// Content hash — used only for the R2 storage key so different files with
// the same metadata don't overwrite each other in the bucket.
function contentSha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

// Album art cover filename: MD5 of "{albumArtist} - {album}".toLowerCase()
// Matches the Rust crate convention so covers aren't duplicated.
function coverMd5(albumArtist: string, album: string): string {
  return createHash("md5")
    .update(`${albumArtist} - ${album}`.toLowerCase())
    .digest("hex");
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
// Auth helper — resolves JWT → user row
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
// Pipeline:
//   1. JWT auth
//   2. Magic-byte MIME check → reject non-audio
//   3. music-metadata parse (no primary tag → reject)
//   4. Completeness check: title + artist + album required
//   5. Meta-SHA256 dedup (matches Dropbox/Google Drive crate logic)
//   6. Duplicate-per-user check by trackId
//   7. Album art extraction + upload to covers/
//   8. Upsert track row (duration in ms, discNumber defaults to 1)
//   9. PUT audio file to music/ using content-SHA256 storage key
//  10. Insert user_uploads record
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

  const storageProviderIdParam =
    (formData.get("storage_provider_id") as string | null) || null;

  const buf = Buffer.from(await file.arrayBuffer());

  // --- Format validation (magic bytes, not Content-Type) ---
  const mime = detectMime(buf);
  if (!mime || !ALLOWED_MIME_TYPES.has(mime)) {
    c.status(400);
    return c.json({
      error: "INVALID_FORMAT",
      message: "Only audio files are accepted (MP3, FLAC, M4A, OGG, WAV, AIFF)",
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

  // No primary tag block at all → reject (mirrors lofty primary_tag check)
  if (!common.title && !common.artist && !common.album) {
    c.status(422);
    return c.json({
      error: "NO_TAGS",
      message:
        "No audio tags found in this file. Please tag your file before uploading.",
    });
  }

  // --- Completeness check ---
  // Validates all fields required by the app.rocksky.song ATProto lexicon:
  //   required: [title, artist, album, albumArtist, duration, createdAt]
  //   albumArtist falls back to artist; createdAt is server-set.
  //   Constraints: title ≤ 512, artist/albumArtist/album ≤ 256, duration ≥ 1.
  const durationMs = format.duration ? Math.round(format.duration * 1000) : 0;

  const missing: string[] = [];
  if (!common.title?.trim()) missing.push("title");
  else if (common.title.trim().length > 512)
    missing.push("title (too long, max 512 chars)");
  if (!common.artist?.trim()) missing.push("artist");
  else if (common.artist.trim().length > 256)
    missing.push("artist (too long, max 256 chars)");
  if (!common.album?.trim()) missing.push("album");
  else if (common.album.trim().length > 256)
    missing.push("album (too long, max 256 chars)");
  if (durationMs < 1) missing.push("duration");
  if (!common.picture?.length) missing.push("album art");

  // albumArtist falls back to artist, but we still check its length if explicitly set
  const albumArtistRaw =
    common.albumartist?.trim() || common.artist?.trim() || "";
  if (albumArtistRaw.length > 256)
    missing.push("albumArtist (too long, max 256 chars)");

  if (missing.length > 0) {
    c.status(422);
    return c.json({
      error: "INCOMPLETE_METADATA",
      message: `Missing required tags: ${missing.join(", ")}. Please tag your file before uploading.`,
      missingFields: missing,
    });
  }

  const title = common.title!.trim();
  const artist = common.artist!.trim();
  const album = common.album!.trim();
  const albumArtist = common.albumartist?.trim() || artist;

  // --- Content SHA-256: used for upload dedup and R2 storage key ---
  const fileHash = contentSha256(buf);
  const ext = MIME_TO_EXT[mime] ?? "bin";
  const storageKey = `music/${user.id}/${fileHash}.${ext}`;

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
      message: "This exact file is already in your library",
      uploadId: existingUpload.id,
    });
  }

  // --- Metadata SHA-256: global track dedup across all ingestion sources ---
  const sha256 = metaSha256(title, artist, album);

  const existingTrack = await ctx.db
    .select()
    .from(tables.tracks)
    .where(eq(tables.tracks.sha256, sha256))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  // Track already exists — skip saveTrack (no new ATProto record needed)

  // --- Album art: extract embedded picture, upload to covers/ ---
  let albumArtUrl: string | null = null;
  const picture = common.picture?.[0];
  if (picture && PICTURE_MIME_TO_EXT[picture.format]) {
    try {
      const ext = PICTURE_MIME_TO_EXT[picture.format];
      const coverKey = `covers/${coverMd5(albumArtist, album)}.${ext}`;
      const s3 = makeS3Client();
      await s3.send(
        new PutObjectCommand({
          Bucket: env.S3_COVERS_BUCKET_NAME,
          Key: coverKey,
          Body: picture.data,
          ContentType: picture.format,
        }),
      );
      albumArtUrl = `${env.CDN_URL}/${coverKey}`;
    } catch (e) {
      consola.warn(
        "[uploads] album art upload failed, continuing without it",
        e,
      );
    }
  }

  // --- Disc number: default to 1 when 0 or missing (matches Rust crate) ---
  const discNumber = (() => {
    const d = common.disk?.no;
    if (!d || d === 0) return 1;
    return d;
  })();

  // --- Release date: only store if it contains "-" (excludes year-only) ---
  const releaseDate = (() => {
    const d = common.date?.toString() ?? common.originaldate?.toString();
    return d?.includes("-") ? d : null;
  })();

  // --- Publish ATProto record + upsert track (proper at:// URI via agent) ---
  // This mirrors what the Dropbox/Google Drive crates do: POST to /tracks,
  // which calls saveTrack → putSongRecord → real at://{did}/app.rocksky.song/{rkey}
  if (!existingTrack) {
    const agent = await createAgent(ctx.oauthClient, user.did);
    if (!agent) {
      c.status(401);
      return c.text("Unauthorized");
    }
    await saveTrack(
      ctx,
      {
        title,
        artist,
        album,
        albumArtist,
        duration: durationMs,
        trackNumber: common.track?.no ?? null,
        discNumber,
        genre: common.genre?.[0] ?? null,
        genres: common.genre ?? null,
        composer: common.composer?.[0] ?? null,
        albumArt: albumArtUrl,
        releaseDate: releaseDate ? new Date(releaseDate) : null,
        year: common.year ?? null,
        lyrics: common.lyrics ?? null,
        copyrightMessage: common.copyright ?? null,
        mbId:
          common.musicbrainz_trackid ?? common.musicbrainz_recordingid ?? null,
        artists: null,
        label: common.label?.[0] ?? null,
        artistPicture: null,
        spotifyLink: null,
        lastfmLink: null,
        youtubeLink: null,
        tidalLink: null,
        appleMusicLink: null,
        deezerLink: null,
        timestamp: null,
      },
      agent,
    );

    // Respect ATProto PDS rate limits — mirrors the 3-second sleep the
    // Dropbox/Google Drive crates use after creating a new track record.
    // The frontend processes files sequentially so this delay is applied
    // per-file, effectively throttling bulk uploads to ~1 track per 3s.
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  // After saveTrack the track row is guaranteed to exist — look it up by sha256
  const track = await ctx.db
    .select()
    .from(tables.tracks)
    .where(eq(tables.tracks.sha256, sha256))
    .limit(1)
    .then((rows) => rows[0]);

  // --- Upload audio file to storage (managed or BYO) ---
  const {
    client: s3,
    bucket,
    storageProviderId,
  } = await resolveStorageClient(user.id, storageProviderIdParam);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: storageKey,
      Body: buf,
      ContentType: mime,
      ContentLength: buf.length,
      Metadata: {
        userId: user.id,
        trackId: track.id,
        originalFilename: encodeURIComponent(file.name),
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
      storageProviderId,
    })
    .returning();

  // Fire-and-forget Typesense indexing
  indexLibraryTrack({
    id: upload.id,
    user_id: user.id,
    track_id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    album_artist: track.albumArtist ?? track.artist,
    genre: track.genre ?? undefined,
    composer: track.composer ?? undefined,
    year: track.year ?? undefined,
    duration: track.duration,
    album_art: track.albumArt ?? undefined,
    r2_key: storageKey,
    mime_type: mime,
    file_size: buf.length,
    original_filename: file.name,
    uploaded_at: upload.uploadedAt.getTime(),
    mb_id: track.mbId ?? undefined,
    track_number: track.trackNumber ?? undefined,
    disc_number: track.discNumber ?? undefined,
  }).catch((e) => consola.warn("[typesense] index failed:", e));

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
app.get("/", async (c) => {
  const user = await resolveUser(c.req.header("authorization"));
  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const size = Math.min(+c.req.query("size") || 50, 200);
  const offset = +c.req.query("offset") || 0;
  const q = c.req.query("q")?.trim() || undefined;
  const albumUri = c.req.query("albumUri")?.trim() || undefined;
  const albumArtist = c.req.query("albumArtist")?.trim() || undefined;
  const albumName = c.req.query("albumName")?.trim() || undefined;

  // Full-text search via Typesense; album/listing queries stay on Postgres.
  if (q) {
    const hits = await searchLibraryTracks({
      query: q,
      userId: user.id,
      limit: size,
      offset,
    });
    if (hits.length === 0) return c.json([]);

    // Enrich with full DB data so all fields (albumUri, artistUri, sha256, uri…)
    // are present — Typesense only stores a subset for search purposes.
    const uploadIds = hits.map((h) => h.upload.id);
    const dbRows = await ctx.db
      .select({
        upload: tables.userUploads,
        track: tables.tracks,
        albumReleaseDate: tables.albums.releaseDate,
        albumYear: tables.albums.year,
      })
      .from(tables.userUploads)
      .innerJoin(
        tables.tracks,
        eq(tables.userUploads.trackId, tables.tracks.id),
      )
      .leftJoin(tables.albums, eq(tables.albums.uri, tables.tracks.albumUri))
      .where(
        and(
          eq(tables.userUploads.userId, user.id),
          inArray(tables.userUploads.id, uploadIds),
        ),
      );

    // Preserve Typesense relevance order.
    const rowMap = new Map(dbRows.map((r) => [r.upload.id, r]));
    const ordered = uploadIds.map((id) => rowMap.get(id)).filter(Boolean);
    return c.json(ordered);
  }

  const albumFilter = albumUri
    ? eq(tables.tracks.albumUri, albumUri)
    : albumArtist && albumName
      ? and(
          eq(tables.tracks.albumArtist, albumArtist),
          eq(tables.tracks.album, albumName),
        )
      : undefined;

  const whereClause = albumFilter
    ? and(eq(tables.userUploads.userId, user.id), albumFilter)
    : eq(tables.userUploads.userId, user.id);

  const orderByClause = albumFilter
    ? [
        asc(tables.tracks.trackNumber),
        asc(tables.tracks.title),
        asc(tables.tracks.artist),
      ]
    : [asc(tables.tracks.title), asc(tables.tracks.artist)];

  const uploads = await ctx.db
    .select({
      upload: tables.userUploads,
      track: tables.tracks,
      albumReleaseDate: tables.albums.releaseDate,
      albumYear: tables.albums.year,
    })
    .from(tables.userUploads)
    .innerJoin(tables.tracks, eq(tables.userUploads.trackId, tables.tracks.id))
    .leftJoin(tables.albums, eq(tables.albums.uri, tables.tracks.albumUri))
    .where(whereClause)
    .orderBy(...orderByClause)
    .limit(size)
    .offset(offset);

  return c.json(uploads);
});

// GET /uploads/stream-token --------------------------------------------------
// Issues a short-lived opaque token (random hex, stored in Redis with 1 h TTL)
// for use as ?token= in stream URLs.  WASM audio can't set HTTP headers so we
// use this instead of the full user JWT.
app.get("/stream-token", async (c) => {
  const user = await resolveUser(c.req.header("authorization"));
  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }
  const token = Array.from(crypto.getRandomValues(new Uint8Array(20)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const ttl = 3600;
  await ctx.redis.setEx(`stream:${token}`, ttl, user.id);
  return c.json({ token, expiresIn: ttl });
});

// GET /uploads/:id/stream ----------------------------------------------------
// Streams audio through the API so the internal R2 URL is never exposed.
// Auth: Bearer header or ?token= query param (opaque stream token from /stream-token).
// Handles Range requests for seeking.
app.options("/:id/stream", (c) => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Range, Authorization",
      "Access-Control-Expose-Headers":
        "Content-Range, Content-Length, Accept-Ranges",
      "Access-Control-Max-Age": "86400",
    },
  });
});
app.get("/:id/stream", async (c) => {
  // Resolve the user from the opaque stream token in ?token= or the full JWT in Bearer
  let user: Awaited<ReturnType<typeof resolveUser>> = null;

  const tokenParam = c.req.query("token");
  if (tokenParam) {
    const userId = await ctx.redis.get(`stream:${tokenParam}`);
    if (userId) {
      user = await ctx.db
        .select()
        .from(tables.users)
        .where(eq(tables.users.id, userId))
        .limit(1)
        .then((rows) => rows[0] ?? null);
    }
  } else {
    user = await resolveUser(c.req.header("authorization"));
  }

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
  const rangeHeader = c.req.header("range");

  const s3Res = await s3.send(
    new GetObjectCommand({
      Bucket: env.S3_BUCKET_NAME,
      Key: upload.r2Key,
      ...(rangeHeader ? { Range: rangeHeader } : {}),
    }),
  );

  if (!s3Res.Body) {
    c.status(500);
    return c.text("Stream unavailable");
  }

  const status = rangeHeader ? 206 : 200;
  const headers: Record<string, string> = {
    "Content-Type": upload.mimeType || s3Res.ContentType || "audio/mpeg",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Range, Authorization",
    "Access-Control-Expose-Headers":
      "Content-Range, Content-Length, Accept-Ranges",
  };
  if (s3Res.ContentLength !== undefined) {
    headers["Content-Length"] = String(s3Res.ContentLength);
  }
  if (rangeHeader && s3Res.ContentRange) {
    headers["Content-Range"] = s3Res.ContentRange;
  }

  return new Response(s3Res.Body.transformToWebStream(), { status, headers });
});

// GET /uploads/queue ---------------------------------------------------------
// Returns the persisted upload player queue for the authenticated user.
app.get("/queue", async (c) => {
  const user = await resolveUser(c.req.header("authorization"));
  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const state = await ctx.db
    .select()
    .from(tables.uploadQueueState)
    .where(eq(tables.uploadQueueState.userId, user.id))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!state) {
    return c.json({ queue: [], currentIndex: 0 });
  }

  const uploadIds: string[] = JSON.parse(state.uploadIds);
  if (uploadIds.length === 0) {
    return c.json({ queue: [], currentIndex: 0 });
  }

  const rows = await ctx.db
    .select({
      uploadId: tables.userUploads.id,
      title: tables.tracks.title,
      artist: tables.tracks.artist,
      albumArtist: tables.tracks.albumArtist,
      album: tables.tracks.album,
      albumArt: tables.tracks.albumArt,
      duration: tables.tracks.duration,
      sha256: tables.tracks.sha256,
      songUri: tables.tracks.uri,
    })
    .from(tables.userUploads)
    .innerJoin(tables.tracks, eq(tables.userUploads.trackId, tables.tracks.id))
    .where(
      and(
        inArray(tables.userUploads.id, uploadIds),
        eq(tables.userUploads.userId, user.id),
      ),
    );

  const byId = new Map(rows.map((r) => [r.uploadId, r]));
  const queue = uploadIds.flatMap((id) => {
    const r = byId.get(id);
    return r
      ? [
          {
            uploadId: r.uploadId,
            title: r.title,
            artist: r.artist,
            albumArtist: r.albumArtist,
            album: r.album,
            albumArt: r.albumArt,
            duration: r.duration,
            sha256: r.sha256,
            songUri: r.songUri ?? "",
          },
        ]
      : [];
  });

  return c.json({ queue, currentIndex: state.currentIndex });
});

// PUT /uploads/queue ---------------------------------------------------------
// Persists the current upload player queue for the authenticated user.
app.put("/queue", async (c) => {
  const user = await resolveUser(c.req.header("authorization"));
  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const body = await c.req.json<{
    uploadIds: string[];
    currentIndex: number;
  }>();
  if (!Array.isArray(body.uploadIds) || typeof body.currentIndex !== "number") {
    c.status(400);
    return c.text("Invalid body");
  }

  await ctx.db
    .insert(tables.uploadQueueState)
    .values({
      userId: user.id,
      uploadIds: JSON.stringify(body.uploadIds),
      currentIndex: body.currentIndex,
    })
    .onConflictDoUpdate({
      target: tables.uploadQueueState.userId,
      set: {
        uploadIds: JSON.stringify(body.uploadIds),
        currentIndex: body.currentIndex,
        updatedAt: new Date(),
      },
    });

  return c.json({ status: "ok" });
});

// DELETE /uploads/:id --------------------------------------------------------
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
    new DeleteObjectCommand({ Bucket: env.S3_BUCKET_NAME, Key: upload.r2Key }),
  );

  await ctx.db
    .delete(tables.userUploads)
    .where(eq(tables.userUploads.id, upload.id));

  removeLibraryTrack(upload.id).catch((e) =>
    consola.warn("[typesense] remove failed:", e),
  );

  return c.json({ status: "ok" });
});

export default app;
