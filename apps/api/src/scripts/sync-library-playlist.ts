/**
 * Publish one library (navidrome) playlist to its owner's PDS.
 *
 * The mirror in `library/playlist-mirror` only runs on a mutation, so a
 * playlist created before it existed — or one whose publish failed at the time
 * — has `navidrome_playlists.uri = NULL` and no records in the repo. This
 * script does that first publish on demand.
 *
 * It is safe to re-run. The playlist record is only created when the row has
 * no uri, and a song is only added when the repo has no entry for it yet, so a
 * partial run resumes where it stopped.
 *
 * Usage:
 *   tsx ./src/scripts/sync-library-playlist.ts <did> <playlistId>
 *   tsx ./src/scripts/sync-library-playlist.ts <did> <playlistId> --dry-run
 */
import { AtpAgent } from "@atproto/api";
import chalk from "chalk";
import { consola } from "consola";
import { ctx } from "context";
import { and, asc, eq } from "drizzle-orm";
import { createAgent } from "lib/agent";
import extractPdsFromDid from "lib/extractPdsFromDid";
import { ensurePlaylistRecord } from "library/playlist-mirror";
import {
  addSongsToPlaylist,
  PLAYLIST_SONG_COLLECTION,
} from "playlists/playlists.service";
import tables from "schema";

const [, , did, playlistId, ...flags] = process.argv;
const DRY_RUN = flags.includes("--dry-run");

function usage(message: string): never {
  consola.error(message);
  consola.info(
    "Usage: tsx ./src/scripts/sync-library-playlist.ts <did> <playlistId> [--dry-run]",
  );
  process.exit(1);
}

/** Song AT-URIs already present as entries in the playlist record. */
async function publishedSongUris(playlistUri: string): Promise<Set<string>> {
  const repo = playlistUri.replace(/^at:\/\//, "").split("/")[0];
  const pds = await extractPdsFromDid(repo);
  const agent = new AtpAgent({ service: new URL(pds) });

  const uris = new Set<string>();
  let cursor: string | undefined;
  do {
    const res = await agent.com.atproto.repo.listRecords({
      repo,
      collection: PLAYLIST_SONG_COLLECTION,
      limit: 100,
      cursor,
    });
    for (const rec of res.data.records) {
      const value = rec.value as {
        playlist?: { uri?: string };
        song?: { uri?: string };
      };
      if (value.playlist?.uri === playlistUri && value.song?.uri) {
        uris.add(value.song.uri);
      }
    }
    cursor = res.data.cursor;
  } while (cursor);

  return uris;
}

async function main() {
  if (!did?.startsWith("did:")) usage("First argument must be a DID.");
  if (!playlistId) usage("Second argument must be a library playlist id.");

  const user = await ctx.db
    .select({ id: tables.users.id, handle: tables.users.handle })
    .from(tables.users)
    .where(eq(tables.users.did, did))
    .limit(1)
    .then((rows) => rows[0]);
  if (!user) usage(`No Rocksky user for ${did}`);

  const playlist = await ctx.db
    .select()
    .from(tables.navidromePlaylists)
    .where(
      and(
        eq(tables.navidromePlaylists.id, playlistId),
        eq(tables.navidromePlaylists.userId, user.id),
      ),
    )
    .limit(1)
    .then((rows) => rows[0]);
  if (!playlist) {
    usage(`Playlist ${playlistId} not found for ${user.handle ?? did}`);
  }

  // Ordered the same way navidrome presents the playlist, so the records land
  // in the order the user sees.
  const tracks = await ctx.db
    .select({
      id: tables.tracks.id,
      title: tables.tracks.title,
      uri: tables.tracks.uri,
    })
    .from(tables.navidromePlaylistTracks)
    .innerJoin(
      tables.tracks,
      eq(tables.navidromePlaylistTracks.trackId, tables.tracks.id),
    )
    .where(eq(tables.navidromePlaylistTracks.playlistId, playlistId))
    .orderBy(asc(tables.navidromePlaylistTracks.createdAt))
    .execute();

  consola.info(
    `${chalk.cyan(playlist.name)} — ${chalk.yellow(tracks.length)} track(s), owner ${chalk.cyan(user.handle ?? did)}`,
  );
  consola.info(
    playlist.uri
      ? `Already published at ${chalk.gray(playlist.uri)}`
      : "Not published yet",
  );

  // A track with no song record can't be referenced by a playlist entry.
  const missing = tracks.filter((t) => !t.uri);
  if (missing.length) {
    consola.warn(
      `${chalk.yellow(missing.length)} track(s) have no app.rocksky.song record and will be skipped:`,
    );
    for (const t of missing) consola.warn(`  - ${t.title}`);
  }

  if (DRY_RUN) {
    consola.info(
      `${chalk.gray("[dry run]")} would ${playlist.uri ? "reuse" : "create"} the playlist record and add up to ${chalk.greenBright(tracks.length - missing.length)} song(s)`,
    );
    return;
  }

  const agent = await createAgent(ctx.oauthClient, did);
  if (!agent) {
    usage(
      `No usable PDS session for ${did} — the user has to sign in to Rocksky again.`,
    );
  }

  const { uri, published } = await ensurePlaylistRecord(
    ctx,
    agent,
    did,
    playlistId,
  );
  consola.success(
    published
      ? `Created playlist record ${chalk.gray(uri)}`
      : `Reusing playlist record ${chalk.gray(uri)}`,
  );

  // Re-runs shouldn't duplicate entries, and the AppView may not have ingested
  // an earlier run yet, so ask the repo rather than the playlist_tracks table.
  const already = await publishedSongUris(uri);
  const toAdd = tracks
    .map((t) => t.uri)
    .filter((songUri): songUri is string => !!songUri && !already.has(songUri));

  if (!toAdd.length) {
    consola.success("Every track is already in the playlist record.");
    return;
  }

  // One at a time so a single bad song doesn't abort the rest.
  let added = 0;
  for (const songUri of toAdd) {
    try {
      await addSongsToPlaylist(ctx, agent, did, uri, [songUri]);
      added += 1;
    } catch (e) {
      consola.error(`Failed to add ${songUri}:`, e);
    }
  }

  consola.success(
    `Added ${chalk.greenBright(added)}/${toAdd.length} song(s) to ${chalk.cyan(playlist.name)}`,
  );
  consola.info("The AppView rows appear once jetstream ingests the commits.");
}

await main();
process.exit(0);
