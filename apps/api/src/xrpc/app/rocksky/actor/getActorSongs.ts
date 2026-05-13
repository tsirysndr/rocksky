import type { Context } from "context";
import { consola } from "consola";
import { and, count, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { Cache, Duration, Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { QueryParams } from "lexicon/types/app/rocksky/actor/getActorSongs";
import type { SongViewBasic } from "lexicon/types/app/rocksky/song/defs";
import { deepCamelCaseKeys } from "lib";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const cache = Cache.make({
    capacity: 200,
    timeToLive: Duration.minutes(2),
    lookup: (params: QueryParams) =>
      pipe(
        { params, ctx },
        retrieve,
        Effect.flatMap(presentation),
        Effect.retry({ times: 3 }),
        Effect.timeout("120 seconds"),
      ),
  });

  const getActorSongs = (params: QueryParams) =>
    pipe(
      cache,
      Effect.flatMap((c) => c.get(params)),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({ tracks: [] });
      }),
    );

  server.app.rocksky.actor.getActorSongs({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getActorSongs(params));
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
      const limit = params.limit ?? 10;
      const offset = params.offset ?? 0;

      const user = await ctx.db
        .select({ id: tables.users.id })
        .from(tables.users)
        .where(or(eq(tables.users.did, params.did), eq(tables.users.handle, params.did)))
        .execute()
        .then((rows) => rows[0]);

      if (!user) return { data: [] };

      const dateConditions = [];
      if (params.startDate) {
        dateConditions.push(gte(tables.scrobbles.timestamp, new Date(params.startDate)));
      }
      if (params.endDate) {
        dateConditions.push(lte(tables.scrobbles.timestamp, new Date(params.endDate)));
      }

      const topTracksQuery = await ctx.db
        .select({
          trackId: tables.scrobbles.trackId,
          play_count: count(tables.scrobbles.id).as("play_count"),
        })
        .from(tables.scrobbles)
        .where(
          and(eq(tables.scrobbles.userId, user.id), ...(dateConditions.length > 0 ? dateConditions : [])),
        )
        .groupBy(tables.scrobbles.trackId)
        .orderBy(desc(sql`count(${tables.scrobbles.id})`))
        .limit(limit)
        .offset(offset)
        .execute();

      if (topTracksQuery.length === 0) return { data: [] };

      const trackIds = topTracksQuery.map((t) => t.trackId).filter((id): id is string => id !== null);

      const [tracks, uniqueListenersRows] = await Promise.all([
        ctx.db
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
          .execute(),
        ctx.db
          .select({
            trackId: tables.scrobbles.trackId,
            unique_listeners: sql<number>`count(distinct ${tables.scrobbles.userId})`,
          })
          .from(tables.scrobbles)
          .where(
            and(
              inArray(tables.scrobbles.trackId, trackIds),
              ...(dateConditions.length > 0 ? dateConditions : []),
            ),
          )
          .groupBy(tables.scrobbles.trackId)
          .execute(),
      ]);

      const trackMap = new Map(tracks.map((t) => [t.id, t]));
      const listenersMap = new Map(uniqueListenersRows.map((r) => [r.trackId, Number(r.unique_listeners)]));
      const playCountMap = new Map(topTracksQuery.map((r) => [r.trackId, Number(r.play_count)]));

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
            created_at: track.createdAt.toISOString().replace(/Z$/, ""),
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
  return Effect.sync(() => ({
    tracks: deepCamelCaseKeys(data).map((x: SongViewBasic) => ({
      ...x,
      createdAt: `${x.createdAt}Z`,
    })),
  }));
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
