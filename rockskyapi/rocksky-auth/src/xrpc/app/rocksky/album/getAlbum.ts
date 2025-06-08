import { Context } from "context";
import { eq, or } from "drizzle-orm";
import { Effect, pipe } from "effect";
import { Server } from "lexicon";
import { AlbumViewDetailed } from "lexicon/types/app/rocksky/album/defs";
import { QueryParams } from "lexicon/types/app/rocksky/album/getAlbum";
import _ from "lodash";
import * as R from "ramda";
import tables from "schema";
import { SelectAlbum } from "schema/albums";
import { SelectTrack } from "schema/tracks";

export default function (server: Server, ctx: Context) {
  const getAlbum = (params) =>
    pipe(
      { params, ctx },
      retrieve,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        console.error(err);
        return Effect.succeed({ albums: [] });
      })
    );
  server.app.rocksky.album.getAlbum({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getAlbum(params));
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const retrieve = ({ params, ctx }: { params: QueryParams; ctx: Context }) => {
  return Effect.tryPromise({
    try: async () => {
      const album = await ctx.db
        .select()
        .from(tables.userAlbums)
        .leftJoin(
          tables.albums,
          eq(tables.userAlbums.albumId, tables.albums.id)
        )
        .where(
          or(
            eq(tables.userAlbums.uri, params.uri),
            eq(tables.albums.uri, params.uri)
          )
        )
        .execute()
        .then((rows) => rows[0]?.albums);
      return Promise.all([
        Promise.resolve(album),
        ctx.db
          .select()
          .from(tables.albumTracks)
          .leftJoin(
            tables.tracks,
            eq(tables.albumTracks.trackId, tables.tracks.id)
          )
          .where(eq(tables.albumTracks.albumId, album.id))
          .execute()
          .then((rows) => rows.map((data) => data.tracks))
          .then(dedupeTracksKeepLyrics),
      ]);
    },
    catch: (error) => new Error(`Failed to retrieve album: ${error}`),
  });
};

const presentation = ([album, tracks]: [
  SelectAlbum,
  SelectTrack[],
]): Effect.Effect<AlbumViewDetailed, never> => {
  return Effect.sync(() =>
    deepSnakeCaseKeys({
      ...album,
      tracks,
    })
  );
};

const dedupeTracksKeepLyrics = (tracks) => {
  const trackMap = new Map();

  for (const track of tracks) {
    const key = `${track.discNumber} - ${track.trackNumber}`;

    if (!key) continue;

    const existing = trackMap.get(key);

    // If current has lyrics and either no existing or existing has no lyrics, replace it
    if (!existing || (!existing.lyrics && track.lyrics)) {
      trackMap.set(key, track);
    }
  }

  return Array.from(trackMap.values());
};

type AnyObject = Record<string, any>;

const isObject = (val: unknown): val is AnyObject =>
  typeof val === "object" && val !== null && !Array.isArray(val);

const deepSnakeCaseKeys = <T>(obj: T): any => {
  if (Array.isArray(obj)) {
    return obj.map(deepSnakeCaseKeys);
  } else if (isObject(obj)) {
    return R.pipe(
      R.toPairs,
      R.map(
        ([key, value]) =>
          [_.snakeCase(String(key)), deepSnakeCaseKeys(value)] as [string, any]
      ),
      R.fromPairs
    )(obj as object);
  }
  return obj;
};
