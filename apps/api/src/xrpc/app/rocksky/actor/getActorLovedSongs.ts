import { Context } from "context";
import { desc, eq, or } from "drizzle-orm";
import { Effect, pipe } from "effect";
import { Server } from "lexicon";
import { QueryParams } from "lexicon/types/app/rocksky/actor/getActorLovedSongs";
import { SongViewBasic } from "lexicon/types/app/rocksky/song/defs";
import tables from "schema";
import { SelectTrack } from "schema/tracks";

export default function (server: Server, ctx: Context) {
  const getActorLovedSongs = (params) =>
    pipe(
      { params, ctx },
      retrieve,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        console.error(err);
        return Effect.succeed({ tracks: [] });
      })
    );
  server.app.rocksky.actor.getActorLovedSongs({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getActorLovedSongs(params));
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
}): Effect.Effect<SelectTrack[], Error> => {
  return Effect.tryPromise({
    try: () =>
      ctx.db
        .select()
        .from(tables.lovedTracks)
        .leftJoin(
          tables.tracks,
          eq(tables.lovedTracks.trackId, tables.tracks.id)
        )
        .leftJoin(tables.users, eq(tables.lovedTracks.userId, tables.users.id))
        .where(
          or(
            eq(tables.users.did, params.did),
            eq(tables.users.handle, params.did)
          )
        )
        .limit(params.limit ?? 10)
        .offset(params.offset ?? 0)
        .orderBy(desc(tables.lovedTracks.createdAt))
        .execute()
        .then((rows) =>
          rows.map((row) => ({
            ...row.tracks,
            createdAt: row.loved_tracks.createdAt,
          }))
        ),
    catch: (error) => new Error(`Failed to retrieve loved songs: ${error}`),
  });
};

const presentation = (
  data: SelectTrack[]
): Effect.Effect<{ tracks: SongViewBasic[] }, never> => {
  return Effect.sync(() => ({
    tracks: data.map((track) => ({
      ...track,
      createdAt: track.createdAt.toISOString(),
      updatedAt: track.updatedAt.toISOString(),
    })),
  }));
};
