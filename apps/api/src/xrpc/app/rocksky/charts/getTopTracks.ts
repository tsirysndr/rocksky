import type { Context } from "context";
import { consola } from "consola";
import { count, desc, eq, sql, and, gte, lte } from "drizzle-orm";
import { Effect, pipe, Cache, Duration } from "effect";
import type { Server } from "lexicon";
import type { SongViewBasic } from "lexicon/types/app/rocksky/song/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/charts/getTopTracks";
import { deepCamelCaseKeys } from "lib";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const getTopTracksCache = Cache.make({
    capacity: 100,
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

  const getTopTracks = (params: QueryParams) =>
    pipe(
      getTopTracksCache,
      Effect.flatMap((cache) => cache.get(params)),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({ tracks: [] });
      }),
    );

  server.app.rocksky.charts.getTopTracks({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getTopTracks(params));
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
}): Effect.Effect<{ data: TopTrack[] }, Error> => {
  return Effect.tryPromise({
    try: async () => {
      const limit = params.limit || 50;
      const offset = params.offset || 0;

      const dateConditions = [];
      if (params.startDate) {
        dateConditions.push(
          gte(tables.scrobbles.timestamp, new Date(params.startDate)),
        );
      }
      if (params.endDate) {
        dateConditions.push(
          lte(tables.scrobbles.timestamp, new Date(params.endDate)),
        );
      }

      const topTracksQuery = ctx.db
        .select({
          trackId: tables.scrobbles.trackId,
          scrobbles: count(tables.scrobbles.id).as("scrobbles"),
        })
        .from(tables.scrobbles)
        .where(dateConditions.length > 0 ? and(...dateConditions) : undefined)
        .groupBy(tables.scrobbles.trackId)
        .orderBy(desc(sql`count(${tables.scrobbles.id})`))
        .limit(limit)
        .offset(offset);

      const topTracksData = await topTracksQuery.execute();

      if (topTracksData.length === 0) {
        return { data: [] };
      }

      const trackIds = topTracksData
        .map((t) => t.trackId)
        .filter((id): id is string => id !== null);

      const tracks = await ctx.db
        .select({
          id: tables.tracks.id,
          title: tables.tracks.title,
          artist: tables.tracks.artist,
          albumArtist: tables.tracks.albumArtist,
          albumArt: tables.tracks.albumArt,
          uri: tables.tracks.uri,
          album: tables.tracks.album,
          duration: tables.tracks.duration,
          trackNumber: tables.tracks.trackNumber,
          discNumber: tables.tracks.discNumber,
          albumUri: tables.tracks.albumUri,
          artistUri: tables.tracks.artistUri,
          sha256: tables.tracks.sha256,
          genre: tables.tracks.genre,
          createdAt: tables.tracks.createdAt,
        })
        .from(tables.tracks)
        .where(sql`${tables.tracks.id} = ANY(${trackIds})`)
        .execute();

      const trackMap = new Map(tracks.map((track) => [track.id, track]));

      const uniqueListenersQuery = await ctx.db
        .select({
          trackId: tables.scrobbles.trackId,
          uniqueListeners:
            sql<number>`count(DISTINCT ${tables.scrobbles.userId})`.as(
              "unique_listeners",
            ),
        })
        .from(tables.scrobbles)
        .where(
          and(
            sql`${tables.scrobbles.trackId} = ANY(${trackIds})`,
            dateConditions.length > 0 ? and(...dateConditions) : undefined,
          ),
        )
        .groupBy(tables.scrobbles.trackId)
        .execute();

      const listenersMap = new Map(
        uniqueListenersQuery.map((item) => [
          item.trackId,
          Number(item.uniqueListeners),
        ]),
      );

      const result: TopTrack[] = topTracksData
        .map((item) => {
          const track = trackMap.get(item.trackId!);
          if (!track) return null;

          return {
            id: track.id,
            title: track.title,
            artist: track.artist,
            album_artist: track.albumArtist,
            album_art: track.albumArt,
            uri: track.uri,
            album: track.album,
            duration: track.duration,
            track_number: track.trackNumber,
            disc_number: track.discNumber,
            play_count: Number(item.scrobbles),
            unique_listeners: listenersMap.get(item.trackId!) || 0,
            album_uri: track.albumUri,
            artist_uri: track.artistUri,
            sha256: track.sha256,
            tags: track.genre ? [track.genre] : [],
            created_at: track.createdAt.toISOString(),
          };
        })
        .filter((item): item is TopTrack => item !== null);

      return { data: result };
    },
    catch: (error) => new Error(`Failed to retrieve top tracks: ${error}`),
  });
};

const presentation = ({
  data,
}: {
  data: TopTrack[];
}): Effect.Effect<{ tracks: SongViewBasic[] }, never> => {
  return Effect.sync(() => ({ tracks: deepCamelCaseKeys(data) }));
};

type TopTrack = {
  id: string;
  title: string;
  artist: string;
  album_artist: string;
  album_art: string | null;
  uri: string | null;
  album: string;
  duration: number;
  track_number: number | null;
  disc_number: number | null;
  play_count: number;
  unique_listeners: number;
  album_uri: string | null;
  artist_uri: string | null;
  sha256: string;
  tags: string[];
  created_at: string;
};
