import { consola } from "consola";
import { ctx } from "context";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import utc from "dayjs/plugin/utc";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { createAgent } from "lib/agent";
import { verifyToken } from "lib/verifyToken";
import { type ImportCache, scrobbleTrack } from "nowplaying/nowplaying.service";
import importJobs from "schema/import-jobs";
import scrobbles from "schema/scrobbles";
import users from "schema/users";
import type { Track } from "types/track";

dayjs.extend(customParseFormat);
dayjs.extend(utc);

const app = new Hono();

// In-process cancellation signals — checked inside the runImport loop
const cancelledJobs = new Set<string>();
// In-process current track per job — for real-time "currently processing" display
const currentTracks = new Map<string, string>();

async function getBearerDid(bearer: string): Promise<string> {
  const payload = (await verifyToken(bearer)) as { did: string };
  return payload.did;
}

async function getAuthedUser(c: {
  req: { header: (k: string) => string | undefined };
}) {
  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();
  if (!bearer || bearer === "null") return null;
  try {
    const did = await getBearerDid(bearer);
    const user = await ctx.db
      .select()
      .from(users)
      .where(eq(users.did, did))
      .limit(1)
      .then((rows) => rows[0]);
    return user || null;
  } catch {
    return null;
  }
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseLastfmCsv(text: string): Track[] {
  // Actual Last.fm export columns:
  // uts, utc_time, artist, artist_mbid, album, album_mbid, track, track_mbid
  const lines = text.replace(/^﻿/, "").split("\n");
  const tracks: Track[] = [];

  // Find header row to determine column indices (defensive against future changes)
  let headerIdx = 0;
  let colUts = 0,
    colArtist = 2,
    colAlbum = 4,
    colTrack = 6,
    colTrackMbid = 7;

  const firstLine = parseCSVLine(lines[0].trim());
  if (firstLine[0]?.toLowerCase() === "uts") {
    headerIdx = 1;
    colUts = firstLine.indexOf("uts");
    colArtist = firstLine.indexOf("artist");
    colAlbum = firstLine.indexOf("album");
    colTrack = firstLine.indexOf("track");
    colTrackMbid = firstLine.indexOf("track_mbid");
  }

  for (let i = headerIdx; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const fields = parseCSVLine(line);
    if (fields.length < 7) continue;

    const uts = fields[colUts];
    const artist = fields[colArtist];
    const album = fields[colAlbum];
    const title = fields[colTrack];
    const mbId = colTrackMbid >= 0 ? fields[colTrackMbid] : undefined;

    if (!artist || !title) continue;

    const timestamp = parseInt(uts, 10);
    if (!timestamp || Number.isNaN(timestamp)) continue;

    tracks.push({
      title,
      artist,
      albumArtist: artist,
      album: album || "Unknown Album",
      duration: 0,
      timestamp,
      mbId: mbId || undefined,
    });
  }

  return tracks;
}

type SpotifyExtendedEntry = {
  ts?: string;
  ms_played?: number;
  master_metadata_track_name?: string | null;
  master_metadata_album_artist_name?: string | null;
  master_metadata_album_album_name?: string | null;
  spotify_track_uri?: string | null;
};

type SpotifyBasicEntry = {
  endTime?: string;
  artistName?: string;
  trackName?: string;
  msPlayed?: number;
};

function parseSpotifyJson(data: unknown): Track[] {
  if (!Array.isArray(data)) return [];

  const tracks: Track[] = [];

  for (const item of data) {
    // Extended streaming history format
    if ("master_metadata_track_name" in item) {
      const entry = item as SpotifyExtendedEntry;
      if (!entry.master_metadata_track_name) continue;
      if (!entry.master_metadata_album_artist_name) continue;
      if ((entry.ms_played ?? 0) < 30000) continue;

      const ts = dayjs.utc(entry.ts);
      if (!ts.isValid()) continue;

      const spotifyId = entry.spotify_track_uri?.split(":").pop();
      tracks.push({
        title: entry.master_metadata_track_name,
        artist: entry.master_metadata_album_artist_name,
        albumArtist: entry.master_metadata_album_artist_name,
        album: entry.master_metadata_album_album_name || "Unknown Album",
        duration: entry.ms_played ?? 0,
        timestamp: ts.unix(),
        spotifyLink: spotifyId
          ? `https://open.spotify.com/track/${spotifyId}`
          : undefined,
      });
    } else if ("trackName" in item) {
      // Basic streaming history format
      const entry = item as SpotifyBasicEntry;
      if (!entry.trackName) continue;
      if (!entry.artistName) continue;
      if ((entry.msPlayed ?? 0) < 30000) continue;

      const ts = dayjs.utc(entry.endTime, "YYYY-MM-DD HH:mm");
      if (!ts.isValid()) continue;

      tracks.push({
        title: entry.trackName,
        artist: entry.artistName,
        albumArtist: entry.artistName,
        album: "Unknown Album",
        duration: entry.msPlayed ?? 0,
        timestamp: ts.unix(),
      });
    }
  }

  return tracks;
}

async function runImport(
  jobId: string,
  tracks: Track[],
  userDid: string,
): Promise<void> {
  const agent = await createAgent(ctx.oauthClient, userDid);
  if (!agent) {
    await ctx.db
      .update(importJobs)
      .set({
        status: "failed",
        errors: JSON.stringify([
          "Authentication failed: ATProto session not found or expired. Try scrobbling a track first to refresh your session.",
        ]),
        updatedAt: new Date(),
      })
      .where(eq(importJobs.id, jobId));
    return;
  }

  // Bulk pre-filter: skip tracks whose timestamp already exists in the DB for this user.
  // This avoids running the full scrobbleTrack pipeline (ATProto writes + 30s polling) for duplicates.
  const user = await ctx.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.did, userDid))
    .limit(1)
    .then((rows) => rows[0]);

  if (user) {
    const validTimestamps = tracks
      .map((t) => t.timestamp ?? 0)
      .filter((t) => t > 0);
    if (validTimestamps.length > 0) {
      // Math.min(...arr) passes every element as a call argument and throws
      // RangeError on large imports (a 20-year Last.fm history is ~500k rows).
      const minTs = new Date(
        validTimestamps.reduce((a, b) => Math.min(a, b)) * 1000,
      );
      const maxTs = new Date(
        validTimestamps.reduce((a, b) => Math.max(a, b)) * 1000,
      );

      const existing = await ctx.db
        .select({ timestamp: scrobbles.timestamp })
        .from(scrobbles)
        .where(
          and(
            eq(scrobbles.userId, user.id),
            gte(scrobbles.timestamp, minTs),
            lte(scrobbles.timestamp, maxTs),
          ),
        )
        .execute();

      const existingSet = new Set(
        existing.map((r) => Math.floor(r.timestamp.getTime() / 1000)),
      );
      const before = tracks.length;
      tracks = tracks.filter((t) => !existingSet.has(t.timestamp ?? 0));
      const skipped = before - tracks.length;

      if (skipped > 0) {
        consola.info(
          `[import] Pre-filtered ${skipped} already-imported scrobbles, ${tracks.length} remaining`,
        );
        await ctx.db
          .update(importJobs)
          .set({ total: tracks.length, updatedAt: new Date() })
          .where(eq(importJobs.id, jobId));
      }
    }
  }

  let processed = 0;
  let failed = 0;
  const errors: string[] = [];

  // Shared cache per import job — prevents duplicate ATProto artist/album writes
  // across concurrent tracks in the same batch
  const importCache: ImportCache = {
    artistOps: new Map(),
    albumOps: new Map(),
  };

  // Process tracks in parallel batches to saturate ATProto/DB I/O while
  // keeping PDS pressure reasonable. MusicBrainz is already rate-limited at
  // 1 RPS inside the webscrobbler service, so concurrent calls just queue there.
  const CONCURRENCY = 3;

  for (let i = 0; i < tracks.length; i += CONCURRENCY) {
    if (cancelledJobs.has(jobId)) {
      cancelledJobs.delete(jobId);
      currentTracks.delete(jobId);
      consola.info(
        `[import] Job ${jobId} cancelled after ${processed} scrobbles`,
      );
      return;
    }

    const batch = tracks.slice(i, i + CONCURRENCY);
    // Show first track of batch as current track
    currentTracks.set(jobId, `${batch[0].title} — ${batch[0].artist}`);

    const results = await Promise.allSettled(
      batch.map((track) =>
        scrobbleTrack(ctx, track, agent, userDid, true, importCache),
      ),
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result.status === "fulfilled") {
        processed++;
      } else {
        failed++;
        const msg =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
        if (errors.length < 50) {
          errors.push(`${batch[j].title} - ${batch[j].artist}: ${msg}`);
        }
        consola.warn(`[import] Failed scrobble "${batch[j].title}": ${msg}`);
      }
    }

    // Update DB progress after each batch
    await ctx.db
      .update(importJobs)
      .set({
        processed,
        failed,
        errors: errors.length > 0 ? JSON.stringify(errors) : null,
        updatedAt: new Date(),
      })
      .where(eq(importJobs.id, jobId));

    // Check DB-level cancellation roughly every ~15 tracks (cross-instance safe)
    if (Math.floor(i / CONCURRENCY) % 5 === 0) {
      const currentStatus = await ctx.db
        .select({ status: importJobs.status })
        .from(importJobs)
        .where(eq(importJobs.id, jobId))
        .limit(1)
        .then((rows) => rows[0]?.status);

      if (currentStatus === "cancelled" || cancelledJobs.has(jobId)) {
        cancelledJobs.delete(jobId);
        currentTracks.delete(jobId);
        consola.info(
          `[import] Job ${jobId} cancelled after ${processed} scrobbles`,
        );
        return;
      }
    }

    // Brief pause between batches to avoid hammering the ATProto PDS
    if (i + CONCURRENCY < tracks.length) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  currentTracks.delete(jobId);

  await ctx.db
    .update(importJobs)
    .set({
      status: "completed",
      processed,
      failed,
      errors: errors.length > 0 ? JSON.stringify(errors) : null,
      updatedAt: new Date(),
    })
    .where(eq(importJobs.id, jobId));

  consola.info(
    `[import] Job ${jobId} done: ${processed} ok, ${failed} failed out of ${tracks.length}`,
  );
}

app.post("/upload", async (c) => {
  const user = await getAuthedUser(c);
  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  // Block if there's a recent running job, but allow if it's stale (> 30 min no update)
  const existing = await ctx.db
    .select()
    .from(importJobs)
    .where(eq(importJobs.userId, user.id))
    .orderBy(desc(importJobs.createdAt))
    .limit(1)
    .then((rows) => rows[0]);

  if (existing?.status === "running") {
    const staleThresholdMs = 30 * 60 * 1000;
    const msSinceUpdate = Date.now() - new Date(existing.updatedAt).getTime();
    if (msSinceUpdate < staleThresholdMs) {
      c.status(409);
      return c.json({ error: "An import is already running" });
    }
    // Mark stale job as failed
    await ctx.db
      .update(importJobs)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(importJobs.id, existing.id));
  }

  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    c.status(400);
    return c.json({ error: "Invalid multipart form data" });
  }

  const file = formData.get("file") as File | null;
  const type = formData.get("type") as string | null;

  if (!file || !type || !["lastfm", "spotify"].includes(type)) {
    c.status(400);
    return c.json({ error: "Missing file or invalid type" });
  }

  const text = await file.text();
  let tracks: Track[] = [];

  try {
    if (type === "lastfm") {
      tracks = parseLastfmCsv(text);
    } else {
      const json = JSON.parse(text);
      tracks = parseSpotifyJson(json);
    }
  } catch (err) {
    c.status(400);
    return c.json({
      error:
        "Failed to parse file: " +
        (err instanceof Error ? err.message : String(err)),
    });
  }

  if (tracks.length === 0) {
    c.status(400);
    return c.json({ error: "No valid scrobbles found in file" });
  }

  // Sort oldest-first so import respects chronological order
  tracks.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

  const [job] = await ctx.db
    .insert(importJobs)
    .values({
      userId: user.id,
      type,
      status: "running",
      total: tracks.length,
      processed: 0,
      failed: 0,
    })
    .returning();

  // Fire-and-forget background processing
  runImport(job.id, tracks, user.did).catch((err) => {
    consola.error(`[import] Unhandled error in job ${job.id}:`, err);
    const msg = err instanceof Error ? err.message : String(err);
    ctx.db
      .update(importJobs)
      .set({
        status: "failed",
        errors: JSON.stringify([`Import crashed: ${msg}`]),
        updatedAt: new Date(),
      })
      .where(eq(importJobs.id, job.id))
      .catch(consola.error);
  });

  return c.json(job);
});

app.get("/status", async (c) => {
  const user = await getAuthedUser(c);
  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const job = await ctx.db
    .select()
    .from(importJobs)
    .where(eq(importJobs.userId, user.id))
    .orderBy(desc(importJobs.createdAt))
    .limit(1)
    .then((rows) => rows[0]);

  return c.json(
    job ? { ...job, currentTrack: currentTracks.get(job.id) ?? null } : null,
  );
});

app.get("/jobs", async (c) => {
  const user = await getAuthedUser(c);
  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const size = Math.min(+c.req.query("size") || 20, 100);
  const offset = +c.req.query("offset") || 0;

  const jobs = await ctx.db
    .select()
    .from(importJobs)
    .where(eq(importJobs.userId, user.id))
    .orderBy(desc(importJobs.createdAt))
    .limit(size)
    .offset(offset);

  return c.json(jobs);
});

app.post("/cancel", async (c) => {
  const user = await getAuthedUser(c);
  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const job = await ctx.db
    .select()
    .from(importJobs)
    .where(eq(importJobs.userId, user.id))
    .orderBy(desc(importJobs.createdAt))
    .limit(1)
    .then((rows) => rows[0]);

  if (!job || job.status !== "running") {
    c.status(400);
    return c.json({ error: "No running import to cancel" });
  }

  // Immediately write "cancelled" to DB so the SSE reflects it within 1 s,
  // regardless of which server instance is running the import loop.
  await ctx.db
    .update(importJobs)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(importJobs.id, job.id));

  // Also signal the in-process loop for fast exit (same-instance case).
  cancelledJobs.add(job.id);
  return c.json({ ok: true });
});

app.get("/events", async (c) => {
  const token = c.req.query("token");
  if (!token || token === "null") {
    c.status(401);
    return c.text("Unauthorized");
  }

  let did: string;
  try {
    const payload = (await verifyToken(token)) as { did: string };
    did = payload.did;
  } catch {
    c.status(401);
    return c.text("Unauthorized");
  }

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

  return streamSSE(c, async (stream) => {
    // 2-hour max to guard against zombie connections
    const deadline = Date.now() + 2 * 60 * 60 * 1000;

    while (Date.now() < deadline && !stream.aborted) {
      const job = await ctx.db
        .select()
        .from(importJobs)
        .where(eq(importJobs.userId, user.id))
        .orderBy(desc(importJobs.createdAt))
        .limit(1)
        .then((rows) => rows[0]);

      await stream.writeSSE({
        event: "progress",
        data: JSON.stringify(
          job
            ? { ...job, currentTrack: currentTracks.get(job.id) ?? null }
            : null,
        ),
      });

      if (
        !job ||
        job.status === "completed" ||
        job.status === "failed" ||
        job.status === "cancelled"
      ) {
        break;
      }

      await stream.sleep(1000);
    }
  });
});

export default app;
