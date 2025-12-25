import type { Context } from "../context.ts";
import { eq } from "drizzle-orm";
import { Effect, Match, pipe } from "effect";
import tables from "../schema/mod.ts";

export default function (ctx: Context, did?: string) {
  return pipe(
    retrieve({
      ctx,
      params: {
        did,
      },
    }),
    Effect.flatMap(presentation),
    Effect.retry({ times: 3 }),
    Effect.timeout("10 seconds"),
    Effect.catchAll((error) =>
      Effect.fail(new Error(`Failed to retrieve scrobbles chart: ${error}`)),
    ),
  );
}

export type Params = {
  did?: string;
  artisturi?: string;
  albumuri?: string;
  songuri?: string;
};

const retrieve = ({ params, ctx }: { params: Params; ctx: Context }) => {
  return Effect.tryPromise({
    try: () => {
      const match = Match.type<Params>().pipe(
        Match.when({ did: (did) => !!did }, ({ did }) =>
          ctx.analytics.post("library.getScrobblesPerDay", {
            user_did: did,
          }),
        ),
        Match.when({ artisturi: (uri) => !!uri }, ({ artisturi }) =>
          ctx.analytics.post("library.getArtistScrobbles", {
            artist_id: artisturi,
          }),
        ),
        Match.when({ albumuri: (uri) => !!uri }, ({ albumuri }) =>
          ctx.analytics.post("library.getAlbumScrobbles", {
            album_id: albumuri,
          }),
        ),
        Match.when(
          { songuri: (uri) => !!uri && uri.includes("app.rocksky.scrobble") },
          ({ songuri }) =>
            ctx.db
              .select()
              .from(tables.scrobbles)
              .leftJoin(
                tables.tracks,
                eq(tables.scrobbles.trackId, tables.tracks.id),
              )
              .where(eq(tables.scrobbles.uri, songuri))
              .execute()
              .then(([row]) => row?.tracks?.uri)
              .then((uri) =>
                ctx.analytics.post("library.getTrackScrobbles", {
                  track_id: uri,
                }),
              ),
        ),
        Match.when(
          { songuri: (uri) => !!uri && !uri.includes("app.rocksky.scrobble") },
          ({ songuri }) =>
            ctx.analytics.post("library.getTrackScrobbles", {
              track_id: songuri,
            }),
        ),
        Match.orElse(() =>
          ctx.analytics.post("library.getScrobblesPerDay", {}),
        ),
      );

      return match(params);
    },
    catch: (error) => new Error(`Failed to retrieve scrobbles chart: ${error}`),
  });
};

interface ChartsView {
  scrobbles: any;
}

const presentation = ({
  data,
}: {
  data: any;
}): Effect.Effect<ChartsView, never> => {
  return Effect.sync(() => ({
    scrobbles: data,
  }));
};
