/**
 * Rebuilds `loved_tracks` from the `app.rocksky.like` records in users' repos.
 *
 *   bun backfill:likes <handle|did> [<handle|did> ...]
 *
 * Likes already in the database (same record uri, or same user + track) are
 * skipped. Users missing from the database are created.
 */
import { AtpAgent } from "@atproto/api";
import chalk from "chalk";
import { consola } from "consola";
import { ctx } from "context";
import { and, eq } from "drizzle-orm";
import { fetchBskyProfile } from "lib/bskyProfile";
import { createHash } from "node:crypto";
import tables from "schema";

const LIKE_NSID = "app.rocksky.like";
const SONG_NSID = "app.rocksky.song";

type LikeRecord = {
  subject?: { uri?: string; cid?: string };
  createdAt?: string;
};

function splitAtUri(uri: string) {
  const [repo, collection, rkey] = uri.replace("at://", "").split("/");
  return repo && collection && rkey ? { repo, collection, rkey } : null;
}

async function resolveDid(input: string): Promise<string> {
  if (input.startsWith("did:")) return input;
  const did = await ctx.baseIdResolver.handle.resolve(input.replace(/^@/, ""));
  if (!did) throw new Error(`Could not resolve handle ${input}`);
  return did;
}

async function ensureUser(did: string, handle: string, pds: AtpAgent) {
  const existing = await ctx.db
    .select()
    .from(tables.users)
    .where(eq(tables.users.did, did))
    .limit(1)
    .then((rows) => rows[0]);
  if (existing) return existing;

  const profile = await fetchBskyProfile(did, pds);
  const [user] = await ctx.db
    .insert(tables.users)
    .values({
      did,
      handle,
      displayName: profile.displayName ?? "",
      avatar: profile.avatar ?? "",
    })
    .returning();

  consola.info(`Created user ${chalk.magenta(handle)}`);
  ctx.nc.publish(
    "rocksky.user",
    Buffer.from(
      JSON.stringify({
        xata_id: user.id,
        did: user.did,
        handle: user.handle,
        display_name: user.displayName,
        avatar: user.avatar,
        xata_createdat: user.createdAt.toISOString(),
        xata_updatedat: user.updatedAt.toISOString(),
        xata_version: 1,
      }),
    ),
  );
  return user;
}

const songHashCache = new Map<string, string | null>();

/** sha256 of the song record itself, fetched from the repo that holds it. */
async function songHash(songUri: string): Promise<string | null> {
  if (songHashCache.has(songUri)) return songHashCache.get(songUri);
  let hash: string | null = null;
  const parts = splitAtUri(songUri);
  try {
    if (parts) {
      const { pds } = await ctx.baseIdResolver.did.resolveAtprotoData(
        parts.repo,
      );
      const agent = new AtpAgent({ service: pds });
      const { data } = await agent.com.atproto.repo.getRecord(parts);
      const song = data.value as {
        title?: string;
        artist?: string;
        album?: string;
      };
      if (song.title && song.artist && song.album) {
        hash = createHash("sha256")
          .update(
            `${song.title} - ${song.artist} - ${song.album}`.toLowerCase(),
          )
          .digest("hex");
      }
    }
  } catch (err) {
    consola.warn(`Could not fetch ${songUri}: ${err.message}`);
  }
  songHashCache.set(songUri, hash);
  return hash;
}

/** Same resolution order as crates/jetstream/src/like.rs. */
async function resolveTrackId(songUri: string): Promise<string | null> {
  const byUri = await ctx.db
    .select({ id: tables.tracks.id })
    .from(tables.tracks)
    .where(eq(tables.tracks.uri, songUri))
    .limit(1)
    .then((rows) => rows[0]);
  if (byUri) return byUri.id;

  const byUserTrack = await ctx.db
    .select({ id: tables.userTracks.trackId })
    .from(tables.userTracks)
    .where(eq(tables.userTracks.uri, songUri))
    .limit(1)
    .then((rows) => rows[0]);
  if (byUserTrack) return byUserTrack.id;

  const hash = await songHash(songUri);
  if (!hash) return null;
  const byHash = await ctx.db
    .select({ id: tables.tracks.id })
    .from(tables.tracks)
    .where(eq(tables.tracks.sha256, hash))
    .limit(1)
    .then((rows) => rows[0]);
  return byHash?.id ?? null;
}

async function backfill(input: string) {
  const did = await resolveDid(input);
  const { handle, pds } = await ctx.baseIdResolver.did.resolveAtprotoData(did);
  const agent = new AtpAgent({ service: pds });
  const user = await ensureUser(did, handle, agent);

  consola.info(
    `Backfilling likes for ${chalk.magenta(handle)} (${chalk.gray(did)}) ...`,
  );

  let cursor: string | undefined;
  const counts = { created: 0, skipped: 0, unresolved: 0 };

  do {
    const { data } = await agent.com.atproto.repo.listRecords({
      repo: did,
      collection: LIKE_NSID,
      limit: 100,
      cursor,
    });
    cursor = data.cursor;

    for (const { uri, value } of data.records) {
      const record = value as LikeRecord;
      const subject = record.subject?.uri;
      if (!subject || splitAtUri(subject)?.collection !== SONG_NSID) continue;

      const byUri = await ctx.db
        .select({ id: tables.lovedTracks.id })
        .from(tables.lovedTracks)
        .where(eq(tables.lovedTracks.uri, uri))
        .limit(1)
        .then((rows) => rows[0]);
      if (byUri) {
        counts.skipped++;
        continue;
      }

      const trackId = await resolveTrackId(subject);
      if (!trackId) {
        consola.warn(`Song not found for ${chalk.cyan(uri)} → ${subject}`);
        counts.unresolved++;
        continue;
      }

      const alreadyLiked = await ctx.db
        .select({ id: tables.lovedTracks.id })
        .from(tables.lovedTracks)
        .where(
          and(
            eq(tables.lovedTracks.userId, user.id),
            eq(tables.lovedTracks.trackId, trackId),
          ),
        )
        .limit(1)
        .then((rows) => rows[0]);
      if (alreadyLiked) {
        counts.skipped++;
        continue;
      }

      const createdAt = record.createdAt
        ? new Date(record.createdAt)
        : new Date();
      const [created] = await ctx.db
        .insert(tables.lovedTracks)
        .values({ userId: user.id, trackId, uri, createdAt })
        .onConflictDoNothing()
        .returning();
      if (!created) {
        counts.skipped++;
        continue;
      }

      ctx.nc.publish(
        "rocksky.like",
        Buffer.from(
          JSON.stringify({
            uri,
            user_id: { xata_id: user.id },
            track_id: { xata_id: trackId },
            xata_createdat: created.createdAt.toISOString(),
            xata_id: created.id,
            xata_updatedat: created.createdAt.toISOString(),
            xata_version: 0,
          }),
        ),
      );
      consola.info(`Recreated like ${chalk.cyan(uri)}`);
      counts.created++;
    }
  } while (cursor);

  consola.info(
    `${chalk.magenta(handle)}: ${chalk.greenBright(counts.created)} created, ${counts.skipped} skipped, ${counts.unresolved} unresolved`,
  );
}

const args = process.argv.slice(2);
if (args.length === 0) {
  consola.error("Usage: bun backfill:likes <handle|did> [<handle|did> ...]");
  process.exit(1);
}

for (const arg of args) {
  try {
    await backfill(arg);
  } catch (err) {
    consola.error(`Failed to backfill likes for ${arg}:`, err);
  }
}

await ctx.nc.flush();
process.exit(0);
