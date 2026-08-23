import { AtpAgent, type Agent } from "@atproto/api";
import { TID } from "@atproto/common";
import { InvalidRequestError } from "@atproto/xrpc-server";
import type { Context } from "context";
import { and, eq } from "drizzle-orm";
import * as Playlist from "lexicon/types/app/rocksky/playlist";
import * as PlaylistSong from "lexicon/types/app/rocksky/playlist/song";
import { validateMain } from "lexicon/types/com/atproto/repo/strongRef";
import extractPdsFromDid from "lib/extractPdsFromDid";
import tables from "schema";

export const PLAYLIST_COLLECTION = "app.rocksky.playlist";
export const PLAYLIST_SONG_COLLECTION = "app.rocksky.playlist.song";

/** The repo (DID) an AT-URI addresses. */
export function atUriRepo(uri: string): string {
  const authority = uri.replace(/^at:\/\//, "").split("/")[0];
  if (!authority) {
    throw new InvalidRequestError(`Not an AT-URI: ${uri}`, "InvalidUri");
  }
  return authority;
}

function rkeyOf(uri: string): string {
  return uri.split("/").pop();
}

// A strongRef needs the CID of the exact revision, which only that record's PDS knows.
async function recordRef(uri: string, collection: string) {
  const repo = atUriRepo(uri);
  const pds = await extractPdsFromDid(repo);
  const agent = new AtpAgent({ service: new URL(pds) });
  const res = await agent.com.atproto.repo.getRecord({
    repo,
    collection,
    rkey: rkeyOf(uri),
  });

  const ref = validateMain({ uri, cid: res.data.cid });
  if (!ref.success) {
    throw new InvalidRequestError(`Invalid ref for ${uri}`, "InvalidRef");
  }
  return ref.value;
}

export async function createPlaylist(
  agent: Agent,
  input: { name: string; description?: string; pictureUrl?: string },
): Promise<{ uri: string; cid: string }> {
  const record = {
    $type: PLAYLIST_COLLECTION,
    name: input.name,
    description: input.description || undefined,
    pictureUrl: input.pictureUrl || undefined,
    createdAt: new Date().toISOString(),
  };

  if (!Playlist.validateRecord(record).success) {
    throw new InvalidRequestError("Invalid playlist record", "InvalidRecord");
  }

  const res = await agent.com.atproto.repo.createRecord({
    repo: agent.assertDid,
    collection: PLAYLIST_COLLECTION,
    rkey: TID.nextStr(),
    record,
    validate: false,
  });
  return { uri: res.data.uri, cid: res.data.cid };
}

// Rewrites the record in place on its own rkey, so the AT-URI is stable and the
// ingest upsert updates the existing row. Fields left undefined keep their
// current value — this is a patch, not a replace.
export async function updatePlaylist(
  agent: Agent,
  did: string,
  playlistUri: string,
  patch: { name?: string; description?: string; pictureUrl?: string },
): Promise<{ uri: string; cid: string }> {
  if (atUriRepo(playlistUri) !== did) {
    throw new InvalidRequestError(
      "Only the playlist owner can edit it",
      "Forbidden",
    );
  }

  const rkey = rkeyOf(playlistUri);
  const existing = await agent.com.atproto.repo.getRecord({
    repo: agent.assertDid,
    collection: PLAYLIST_COLLECTION,
    rkey,
  });
  const current = existing.data.value as Record<string, unknown>;

  const record = {
    ...current,
    $type: PLAYLIST_COLLECTION,
    name: patch.name ?? current.name,
    description: patch.description ?? current.description,
    pictureUrl: patch.pictureUrl ?? current.pictureUrl,
  };

  if (!Playlist.validateRecord(record).success) {
    throw new InvalidRequestError("Invalid playlist record", "InvalidRecord");
  }

  const res = await agent.com.atproto.repo.putRecord({
    repo: agent.assertDid,
    collection: PLAYLIST_COLLECTION,
    rkey,
    record,
    validate: false,
  });
  return { uri: res.data.uri, cid: res.data.cid };
}

// Ingest re-checks this; checking here turns a silently-dropped record into a 403.
export async function addSongsToPlaylist(
  ctx: Context,
  agent: Agent,
  did: string,
  playlistUri: string,
  songUris: string[],
): Promise<string[]> {
  // Ownership is decidable from the URI alone, so the owner needs no row — which
  // matters right after createPlaylist, before jetstream has produced one.
  if (atUriRepo(playlistUri) !== did) {
    const playlist = await ctx.db
      .select()
      .from(tables.playlists)
      .where(eq(tables.playlists.uri, playlistUri))
      .limit(1)
      .then((rows) => rows[0]);

    if (!playlist) {
      throw new InvalidRequestError("Playlist not found", "NotFound");
    }
    if (!(playlist.collaborators ?? []).includes(did)) {
      throw new InvalidRequestError(
        "You are not the owner or a collaborator of this playlist",
        "Forbidden",
      );
    }
  }

  const playlistRef = await recordRef(playlistUri, PLAYLIST_COLLECTION);
  const created: string[] = [];

  for (const songUri of songUris) {
    const song = await ctx.db
      .select()
      .from(tables.tracks)
      .where(eq(tables.tracks.uri, songUri))
      .limit(1)
      .then((rows) => rows[0]);

    if (!song) {
      throw new InvalidRequestError(`Song not found: ${songUri}`, "NotFound");
    }

    const record = {
      $type: PLAYLIST_SONG_COLLECTION,
      playlist: playlistRef,
      song: await recordRef(songUri, "app.rocksky.song"),
      title: song.title,
      artist: song.artist,
      album: song.album,
      albumArtist: song.albumArtist,
      duration: song.duration,
      albumArtUrl: song.albumArt || undefined,
      addedAt: new Date().toISOString(),
    };

    if (!PlaylistSong.validateRecord(record).success) {
      throw new InvalidRequestError(
        `Invalid playlist song record for ${songUri}`,
        "InvalidRecord",
      );
    }

    const res = await agent.com.atproto.repo.createRecord({
      repo: agent.assertDid,
      collection: PLAYLIST_SONG_COLLECTION,
      rkey: TID.nextStr(),
      record,
      validate: false,
    });
    created.push(res.data.uri);
  }

  return created;
}

// Entries other repos contributed live in their repos; ingest drops those rows
// when it sees the playlist go.
export async function removePlaylist(
  ctx: Context,
  agent: Agent,
  did: string,
  playlistUri: string,
): Promise<void> {
  if (atUriRepo(playlistUri) !== did) {
    throw new InvalidRequestError(
      "Only the playlist owner can remove it",
      "Forbidden",
    );
  }

  for (const uri of await ownEntryUris(ctx, playlistUri, did)) {
    await agent.com.atproto.repo.deleteRecord({
      repo: agent.assertDid,
      collection: PLAYLIST_SONG_COLLECTION,
      rkey: rkeyOf(uri),
    });
  }

  await agent.com.atproto.repo.deleteRecord({
    repo: agent.assertDid,
    collection: PLAYLIST_COLLECTION,
    rkey: rkeyOf(playlistUri),
  });
}

export async function removeTrackFromPlaylist(
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
      ),
    )
    .execute();

  // An entry can only be retracted by the repo that published it.
  const own = entries
    .map((e) => e.uri)
    .filter((uri) => uri && atUriRepo(uri) === did);

  if (own.length === 0) {
    throw new InvalidRequestError(
      entries.length > 0
        ? "That track was added by someone else and can only be removed by them"
        : "Track not found in playlist",
      entries.length > 0 ? "Forbidden" : "NotFound",
    );
  }

  for (const uri of own) {
    await agent.com.atproto.repo.deleteRecord({
      repo: agent.assertDid,
      collection: PLAYLIST_SONG_COLLECTION,
      rkey: rkeyOf(uri),
    });
  }
}

async function ownEntryUris(
  ctx: Context,
  playlistUri: string,
  did: string,
): Promise<string[]> {
  const rows = await ctx.db
    .select({ uri: tables.playlistTracks.uri })
    .from(tables.playlistTracks)
    .innerJoin(
      tables.playlists,
      eq(tables.playlistTracks.playlistId, tables.playlists.id),
    )
    .where(eq(tables.playlists.uri, playlistUri))
    .execute();

  return rows.map((r) => r.uri).filter((uri) => uri && atUriRepo(uri) === did);
}
