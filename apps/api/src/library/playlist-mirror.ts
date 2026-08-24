/**
 * Mirrors the playlists a user builds in their uploaded-music library
 * (navidrome / Subsonic) onto their PDS as `app.rocksky.playlist` records.
 *
 * The mirror is strictly one-way — navidrome → repo. navidrome is the source
 * of truth for the library: every mutation runs there first, and only once it
 * has succeeded is the same change replayed against the repo. Nothing here
 * ever writes an `app.rocksky.playlist` record back into the library tables,
 * so a playlist created elsewhere (the ATProto playlists UI, a Spotify import,
 * another client) never appears in — or edits — the user's navidrome library.
 * The link between the two is `navidrome_playlists.uri`, written once when the
 * record is published.
 *
 * The mirror is deliberately *not* transactional with the navidrome call. A
 * PDS write can fail for reasons entirely outside the user's library (dead
 * OAuth session, PDS down), and failing the whole request then would leave the
 * user staring at a playlist that visibly exists but reported an error. So the
 * navidrome result always stands and the mirror failure is reported alongside
 * it as `atprotoError` for the UI to surface — never swallowed.
 */
import type { Agent } from "@atproto/api";
import { consola } from "consola";
import type { Context } from "context";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { createAgent } from "lib/agent";
import {
  addSongsToPlaylist,
  atUriRepo,
  PLAYLIST_SONG_COLLECTION,
  createPlaylist as publishPlaylist,
  updatePlaylist as publishPlaylistUpdate,
  removePlaylist as retractPlaylist,
} from "playlists/playlists.service";
import tables from "schema";

/** Thrown when the mirror cannot proceed; always reported, never fatal. */
export class MirrorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MirrorError";
  }
}

function rkeyOf(uri: string): string {
  return uri.split("/").pop() as string;
}

async function agentFor(ctx: Context, did: string): Promise<Agent> {
  const agent = await createAgent(ctx.oauthClient, did);
  if (!agent) {
    throw new MirrorError(
      "Your session with your PDS has expired, so the playlist could not be published to your repo.",
    );
  }
  return agent;
}

type PlaylistRow = { id: string; name: string; description: string | null };

/** The Rocksky user row id (`users.xata_id`) behind a DID. */
async function userIdOf(ctx: Context, did: string): Promise<string> {
  const user = await ctx.db
    .select({ id: tables.users.id })
    .from(tables.users)
    .where(eq(tables.users.did, did))
    .limit(1)
    .then((rows) => rows[0]);

  if (!user) {
    throw new MirrorError(`No Rocksky user for ${did}`);
  }
  return user.id;
}

/**
 * Load a playlist the caller owns. navidrome has already rejected non-owners
 * by the time the mirror runs, but this is what makes it structurally
 * impossible for `ensurePlaylistRecord` to stamp the caller's AT-URI onto
 * someone else's row.
 */
async function loadPlaylist(
  ctx: Context,
  did: string,
  playlistId: string,
): Promise<{ row: PlaylistRow; uri: string | null }> {
  const row = await ctx.db
    .select({
      id: tables.navidromePlaylists.id,
      name: tables.navidromePlaylists.name,
      description: tables.navidromePlaylists.description,
      uri: tables.navidromePlaylists.uri,
    })
    .from(tables.navidromePlaylists)
    .where(
      and(
        eq(tables.navidromePlaylists.id, playlistId),
        eq(tables.navidromePlaylists.userId, await userIdOf(ctx, did)),
      ),
    )
    .limit(1)
    .then((rows) => rows[0]);

  if (!row) {
    throw new MirrorError(`Playlist ${playlistId} not found`);
  }
  return { row, uri: row.uri };
}

/**
 * The AT-URI of the record mirroring this playlist, publishing one first if it
 * doesn't have one yet. Playlists created before the mirror existed — and any
 * whose creation-time publish failed — get their record here, on the first
 * mutation that reaches them.
 */
export async function ensurePlaylistRecord(
  ctx: Context,
  agent: Agent,
  did: string,
  playlistId: string,
): Promise<{ uri: string; published: boolean }> {
  const { row, uri } = await loadPlaylist(ctx, did, playlistId);
  if (uri) return { uri, published: false };

  const created = await publishPlaylist(agent, {
    name: row.name,
    description: row.description ?? undefined,
  });

  await ctx.db
    .update(tables.navidromePlaylists)
    .set({ uri: created.uri })
    .where(eq(tables.navidromePlaylists.id, playlistId))
    .execute();

  return { uri: created.uri, published: true };
}

/**
 * The AT-URI mirroring a playlist, or null when it never got a record. Read it
 * before deleting the playlist — the row, and the link, go with it.
 */
export async function playlistUriOf(
  ctx: Context,
  playlistId: string,
): Promise<string | null> {
  const row = await ctx.db
    .select({ uri: tables.navidromePlaylists.uri })
    .from(tables.navidromePlaylists)
    .where(eq(tables.navidromePlaylists.id, playlistId))
    .limit(1)
    .then((rows) => rows[0]);
  return row?.uri ?? null;
}

/** The `app.rocksky.song` AT-URI of a library track, by its navidrome id. */
async function songUriOf(ctx: Context, songId: string): Promise<string> {
  const track = await ctx.db
    .select({ uri: tables.tracks.uri, title: tables.tracks.title })
    .from(tables.tracks)
    .where(eq(tables.tracks.id, songId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!track) {
    throw new MirrorError(`Song ${songId} not found`);
  }
  if (!track.uri) {
    throw new MirrorError(
      `“${track.title}” has no record on your PDS yet, so it could not be added to the playlist there.`,
    );
  }
  return track.uri;
}

/**
 * The song AT-URI at a 0-based position in the navidrome playlist, matching the
 * order `getPlaylist` presents. Must be called *before* the navidrome delete —
 * afterwards the row is gone and the index means something else.
 */
export async function songUriAtIndex(
  ctx: Context,
  playlistId: string,
  index: number,
): Promise<string | null> {
  const rows = await ctx.db
    .select({ uri: tables.tracks.uri })
    .from(tables.navidromePlaylistTracks)
    .innerJoin(
      tables.tracks,
      eq(tables.navidromePlaylistTracks.trackId, tables.tracks.id),
    )
    .where(eq(tables.navidromePlaylistTracks.playlistId, playlistId))
    .orderBy(asc(tables.navidromePlaylistTracks.createdAt))
    .offset(index)
    .limit(1)
    .execute();

  return rows[0]?.uri ?? null;
}

/**
 * Retract a *single* `app.rocksky.playlist.song` record for this song.
 *
 * Not `playlists.service.removeTrackFromPlaylist`, which drops every entry
 * pointing at the song: navidrome lets the same song sit in a playlist twice,
 * and removing one copy there must remove exactly one copy here.
 */
async function removeOneEntry(
  ctx: Context,
  agent: Agent,
  did: string,
  playlistUri: string,
  songUri: string,
): Promise<void> {
  const entries = await ctx.db
    .select({ uri: tables.playlistTracks.uri })
    .from(tables.playlistTracks)
    .innerJoin(
      tables.playlists,
      eq(tables.playlistTracks.playlistId, tables.playlists.id),
    )
    .innerJoin(
      tables.tracks,
      eq(tables.playlistTracks.trackId, tables.tracks.id),
    )
    .where(
      and(
        eq(tables.playlists.uri, playlistUri),
        eq(tables.tracks.uri, songUri),
        isNotNull(tables.playlistTracks.uri),
      ),
    )
    .execute();

  const own = entries
    .map((e) => e.uri as string)
    .filter((uri) => atUriRepo(uri) === did);

  if (own.length === 0) {
    // The entry record exists on the PDS but the row hasn't been ingested from
    // jetstream yet — a fast add-then-remove lands here. The next mutation
    // won't retry it, so say so rather than pretending the repos agree.
    throw new MirrorError(
      "The song was removed from your library playlist, but its record on your PDS is still being indexed and could not be retracted yet.",
    );
  }

  await agent.com.atproto.repo.deleteRecord({
    repo: agent.assertDid,
    collection: PLAYLIST_SONG_COLLECTION,
    rkey: rkeyOf(own[0]),
  });
}

/** Publish the record for a freshly created library playlist. */
export async function mirrorCreate(
  ctx: Context,
  did: string,
  playlistId: string,
): Promise<string> {
  const agent = await agentFor(ctx, did);
  const { uri } = await ensurePlaylistRecord(ctx, agent, did, playlistId);
  return uri;
}

type UpdateChanges = {
  name?: string;
  comment?: string;
  songIdToAdd?: string;
  /** Resolved before the navidrome delete, since the index doesn't survive it. */
  removedSongUri?: string | null;
};

/** Replay a library playlist update — rename, add song, remove song — on the PDS. */
export async function mirrorUpdate(
  ctx: Context,
  did: string,
  playlistId: string,
  changes: UpdateChanges,
): Promise<string> {
  const agent = await agentFor(ctx, did);
  const { uri, published } = await ensurePlaylistRecord(
    ctx,
    agent,
    did,
    playlistId,
  );

  // When the record was published just now it already carries the new name and
  // description — navidrome applied them before the mirror ran, and
  // ensurePlaylistRecord reads the row back. Patching would be a no-op write.
  const renamed = changes.name !== undefined || changes.comment !== undefined;
  if (renamed && !published) {
    await publishPlaylistUpdate(agent, did, uri, {
      name: changes.name,
      description: changes.comment,
    });
  }

  if (changes.songIdToAdd) {
    const songUri = await songUriOf(ctx, changes.songIdToAdd);
    await addSongsToPlaylist(ctx, agent, did, uri, [songUri]);
  }

  if (changes.removedSongUri) {
    await removeOneEntry(ctx, agent, did, uri, changes.removedSongUri);
  }

  return uri;
}

/** Retract the record (and this repo's entries) for a deleted library playlist. */
export async function mirrorDelete(
  ctx: Context,
  did: string,
  playlistUri: string,
): Promise<void> {
  const agent = await agentFor(ctx, did);
  await retractPlaylist(ctx, agent, did, playlistUri);
}

/**
 * Run a mirror step and turn any failure into a message for the response.
 * The navidrome mutation has already committed by this point, so throwing
 * would misreport it as failed.
 */
export async function reportMirror(
  method: string,
  run: () => Promise<void>,
): Promise<string | undefined> {
  try {
    await run();
    return undefined;
  } catch (err) {
    consola.error(`[library.${method}] atproto mirror failed`, err);
    return err instanceof Error
      ? err.message
      : "The playlist could not be synced to your PDS.";
  }
}
