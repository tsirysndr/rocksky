import { AtpAgent } from "@atproto/api";
import { TID } from "@atproto/common";
import chalk from "chalk";
import { consola } from "consola";
import type { Context } from "context";
import { eq } from "drizzle-orm";
import * as Playlist from "lexicon/types/app/rocksky/playlist";
import * as PlaylistSong from "lexicon/types/app/rocksky/playlist/song";
import { validateMain } from "lexicon/types/com/atproto/repo/strongRef";
import { createAgent } from "lib/agent";
import extractPdsFromDid from "lib/extractPdsFromDid";
import { StringCodec } from "nats";
import tables from "schema";
import { indexPlaylists } from "typesense/search";

type ImportedSong = {
  uri: string;
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  duration: number;
  albumArtUrl?: string;
};

type PlaylistImport = {
  did: string;
  name: string;
  description?: string;
  pictureUrl?: string;
  spotifyLink?: string;
  songs: ImportedSong[];
};

/**
 * Publishes an imported playlist to the user's PDS as an
 * `app.rocksky.playlist` record plus one `app.rocksky.playlist.song` record per
 * track. Nothing here writes to `playlists` or `playlist_tracks` — the rows are
 * materialized by the jetstream consumer once these commits come back around,
 * which keeps the repo the only source those tables can come from.
 */
export function onPlaylistImport(ctx: Context) {
  const sc = StringCodec();
  const sub = ctx.nc.subscribe("rocksky.playlist.import");
  (async () => {
    for await (const m of sub) {
      try {
        const payload: PlaylistImport = JSON.parse(sc.decode(m.data));
        consola.info(
          `Importing playlist: ${chalk.cyan(payload.did)} - ${chalk.greenBright(payload.name)}`,
        );
        await publishPlaylist(ctx, payload);
      } catch (e) {
        consola.error("rocksky.playlist.import handler error:", e);
      }
    }
  })().catch((e) =>
    consola.error("rocksky.playlist.import subscriber crashed:", e),
  );
}

/**
 * Reindexes a playlist in Typesense after jetstream has written it. The
 * indexing has to run on this side of the ingest rather than before it, because
 * the row only exists once the commit has been consumed.
 */
export function onPlaylistIndexed(ctx: Context) {
  const sc = StringCodec();
  const sub = ctx.nc.subscribe("rocksky.playlist.indexed");
  (async () => {
    for await (const m of sub) {
      try {
        const id = sc.decode(m.data);
        const [playlist] = await ctx.db
          .select()
          .from(tables.playlists)
          .where(eq(tables.playlists.id, id))
          .execute();
        if (!playlist) continue;
        await indexPlaylists([playlist]);
      } catch (e) {
        consola.warn("[typesense] playlist index failed:", e);
      }
    }
  })().catch((e) =>
    consola.error("rocksky.playlist.indexed subscriber crashed:", e),
  );
}

async function publishPlaylist(ctx: Context, payload: PlaylistImport) {
  const agent = await createAgent(ctx.oauthClient, payload.did);
  if (!agent) {
    consola.error(
      `Failed to create agent, skipping playlist: ${chalk.greenBright(payload.name)} for ${chalk.cyan(payload.did)}`,
    );
    return;
  }

  // Reuse the rkey of a playlist we already published for this Spotify link so
  // a re-run updates the record in place instead of creating a duplicate. This
  // is a read: identity still comes from the repo, not from Postgres.
  const existing = payload.spotifyLink
    ? await ctx.db
        .select()
        .from(tables.playlists)
        .where(eq(tables.playlists.spotifyLink, payload.spotifyLink))
        .limit(1)
        .then((rows) => rows[0])
    : undefined;

  const rkey = existing?.uri ? existing.uri.split("/").pop() : TID.nextStr();

  const record = {
    $type: "app.rocksky.playlist",
    name: payload.name,
    description: payload.description || undefined,
    createdAt: existing?.createdAt
      ? new Date(existing.createdAt).toISOString()
      : new Date().toISOString(),
    pictureUrl: payload.pictureUrl || undefined,
    spotifyLink: payload.spotifyLink || undefined,
  };

  if (!Playlist.validateRecord(record).success) {
    consola.error(`Invalid record: ${chalk.redBright(JSON.stringify(record))}`);
    return;
  }

  let playlistUri: string;
  let playlistCid: string;
  try {
    const res = await agent.com.atproto.repo.putRecord({
      repo: agent.assertDid,
      collection: "app.rocksky.playlist",
      rkey,
      record,
      validate: false,
    });
    playlistUri = res.data.uri;
    playlistCid = res.data.cid;
    consola.info(`Playlist record created: ${chalk.greenBright(playlistUri)}`);
  } catch (e) {
    consola.error(
      `Failed to put playlist record: ${chalk.redBright(e.message)}`,
    );
    return;
  }

  const alreadyAdded = await existingSongUris(ctx, playlistUri);

  for (const song of payload.songs) {
    if (alreadyAdded.has(song.uri)) continue;
    try {
      await publishPlaylistSong(agent, song, playlistUri, playlistCid);
    } catch (e) {
      consola.error(
        `Failed to add ${chalk.cyan(song.title)} to playlist: ${chalk.redBright(e.message)}`,
      );
    }
  }
}

/**
 * Song AT-URIs already present in the playlist, so a re-import doesn't publish
 * a second entry record for a track that is already there.
 */
async function existingSongUris(
  ctx: Context,
  playlistUri: string,
): Promise<Set<string>> {
  const rows = await ctx.db
    .select({ uri: tables.tracks.uri })
    .from(tables.playlistTracks)
    .leftJoin(
      tables.playlists,
      eq(tables.playlistTracks.playlistId, tables.playlists.id),
    )
    .leftJoin(
      tables.tracks,
      eq(tables.playlistTracks.trackId, tables.tracks.id),
    )
    .where(eq(tables.playlists.uri, playlistUri))
    .execute();

  return new Set(rows.map((row) => row.uri).filter(Boolean));
}

async function publishPlaylistSong(
  agent: Awaited<ReturnType<typeof createAgent>>,
  song: ImportedSong,
  playlistUri: string,
  playlistCid: string,
) {
  const songRef = validateMain({
    uri: song.uri,
    cid: await resolveSongCid(song.uri),
  });
  if (!songRef.success) {
    throw new Error(`invalid song ref for ${song.uri}`);
  }

  const playlistRef = validateMain({ uri: playlistUri, cid: playlistCid });
  if (!playlistRef.success) {
    throw new Error(`invalid playlist ref for ${playlistUri}`);
  }

  const record = {
    $type: "app.rocksky.playlist.song",
    playlist: playlistRef.value,
    song: songRef.value,
    title: song.title,
    artist: song.artist,
    album: song.album,
    albumArtist: song.albumArtist,
    duration: song.duration,
    albumArtUrl: song.albumArtUrl || undefined,
    addedAt: new Date().toISOString(),
  };

  if (!PlaylistSong.validateRecord(record).success) {
    throw new Error(`invalid playlist song record for ${song.uri}`);
  }

  const res = await agent.com.atproto.repo.createRecord({
    repo: agent.assertDid,
    collection: "app.rocksky.playlist.song",
    rkey: TID.nextStr(),
    record,
    validate: false,
  });
  consola.info(
    `Playlist song record created: ${chalk.greenBright(res.data.uri)}`,
  );
}

/**
 * A strongRef needs the CID of the exact revision it points at, which only the
 * song's own PDS can tell us — the song may live in another user's repo.
 */
async function resolveSongCid(songUri: string): Promise<string> {
  const repo = songUri.split("/").slice(0, 3).join("/").split("at://")[1];
  const pds = await extractPdsFromDid(repo);
  const subjectAgent = new AtpAgent({ service: new URL(pds) });
  const res = await subjectAgent.com.atproto.repo.getRecord({
    repo,
    collection: "app.rocksky.song",
    rkey: songUri.split("/").pop(),
  });
  return res.data.cid;
}
