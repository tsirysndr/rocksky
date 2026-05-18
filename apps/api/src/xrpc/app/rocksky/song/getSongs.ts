import type { Context } from "context";
import { consola } from "consola";
import { count, desc, eq, inArray, sql } from "drizzle-orm";
import { Cache, Duration, Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { SongViewBasic } from "lexicon/types/app/rocksky/song/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/song/getSongs";
import { deepCamelCaseKeys } from "lib";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const cache = Cache.make({
    capacity: 50,
    timeToLive: Duration.minutes(5),
    lookup: (params: QueryParams) =>
      pipe(
        { params, ctx },
        retrieve,
        Effect.flatMap(presentation),
        Effect.retry({ times: 3 }),
        Effect.timeout("120 seconds"),
      ),
  });

  const getSongs = (params: QueryParams) =>
    pipe(
      cache,
      Effect.flatMap((c) => c.get(params)),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({ songs: [] });
      }),
    );

  server.app.rocksky.song.getSongs({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getSongs(params));
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const retrieve = ({
  params,
  ctx,
}: {
  params: QueryParams;
  ctx: Context;
}): Effect.Effect<{ data: Track[] }, Error> => {
  return Effect.tryPromise({
    try: async () => {
      const limit = params.limit ?? 100;
      const offset = params.offset ?? 0;

      const topTracksQuery = await ctx.db
        .select({
          trackId: tables.scrobbles.trackId,
          play_count: count(tables.scrobbles.id).as("play_count"),
          unique_listeners: sql<number>`count(DISTINCT ${tables.scrobbles.userId})`.as("unique_listeners"),
        })
        .from(tables.scrobbles)
        .innerJoin(
          tables.tracks,
          eq(tables.scrobbles.trackId, tables.tracks.id),
        )
        .where(params.genre ? eq(tables.tracks.genre, params.genre) : undefined)
        .groupBy(tables.scrobbles.trackId)
        .orderBy(desc(sql`count(DISTINCT ${tables.scrobbles.userId})`))
        .limit(limit)
        .offset(offset)
        .execute();

      if (topTracksQuery.length === 0) return { data: [] };

      const trackIds = topTracksQuery
        .map((t) => t.trackId)
        .filter((id): id is string => id !== null);

      const tracks = await ctx.db
        .select({
          id: tables.tracks.id,
          title: tables.tracks.title,
          artist: tables.tracks.artist,
          albumArtist: tables.tracks.albumArtist,
          albumArt: tables.tracks.albumArt,
          album: tables.tracks.album,
          uri: tables.tracks.uri,
          albumUri: tables.tracks.albumUri,
          artistUri: tables.tracks.artistUri,
          sha256: tables.tracks.sha256,
          trackNumber: tables.tracks.trackNumber,
          discNumber: tables.tracks.discNumber,
          duration: tables.tracks.duration,
          copyrightMessage: tables.tracks.copyrightMessage,
          createdAt: tables.tracks.createdAt,
        })
        .from(tables.tracks)
        .where(inArray(tables.tracks.id, trackIds))
        .execute();

      const trackMap = new Map(tracks.map((t) => [t.id, t]));
      const listenersMap = new Map(
        topTracksQuery.map((r) => [r.trackId, Number(r.unique_listeners)]),
      );
      const playCountMap = new Map(
        topTracksQuery.map((r) => [r.trackId, Number(r.play_count)]),
      );

      const data: Track[] = topTracksQuery
        .map((item) => {
          const track = trackMap.get(item.trackId!);
          if (!track) return null;
          return {
            id: track.id,
            uri: track.uri,
            title: track.title,
            artist: track.artist,
            artist_uri: track.artistUri,
            album: track.album,
            album_uri: track.albumUri,
            album_art: track.albumArt,
            album_artist: track.albumArtist,
            copyright_message: track.copyrightMessage,
            disc_number: track.discNumber,
            duration: track.duration,
            sha256: track.sha256,
            track_number: track.trackNumber,
            play_count: playCountMap.get(item.trackId!) ?? 0,
            unique_listeners: listenersMap.get(item.trackId!) ?? 0,
            created_at: track.createdAt.toISOString(),
          };
        })
        .filter((t): t is Track => t !== null);

      return { data };
    },
    catch: (error) => new Error(`Failed to retrieve tracks: ${error}`),
  });
};

const presentation = ({
  data,
}: {
  data: Track[];
}): Effect.Effect<{ tracks: SongViewBasic[] }, never> => {
  return Effect.sync(() => ({ tracks: deepCamelCaseKeys(data) }));
};

type Track = {
  id: string;
  uri: string | null;
  unique_listeners: number;
  play_count: number;
  title: string;
  artist: string;
  artist_uri: string | null;
  album: string;
  album_uri: string | null;
  album_art: string | null;
  album_artist: string;
  copyright_message: string | null;
  disc_number: number | null;
  duration: number;
  sha256: string;
  track_number: number | null;
  created_at: string;
};
