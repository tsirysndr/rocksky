import { consola } from "consola";
import type { Context } from "context";
import { eq, or } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { NeighbourViewBasic } from "lexicon/types/app/rocksky/actor/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/actor/getActorNeighbours";
import { readQuery } from "lib/dbQuery";
import { transientDbRetry } from "lib/dbRetry";
import tables from "schema";
import { queryCache } from "lib/queryCache";
import { neighboursQuery } from "./neighboursQuery";

export default function (server: Server, ctx: Context) {
  const cached = queryCache(
    (params: QueryParams) =>
      pipe(
        { params, ctx },
        retrieve,
        Effect.flatMap(presentation),
        Effect.retry(transientDbRetry),
        Effect.timeout("120 seconds"),
      ),
    "10 minutes",
    100,
  );

  const getActorNeighbours = (params: QueryParams) =>
    pipe(
      cached(params),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({ neighbours: [] });
      }),
    );

  server.app.rocksky.actor.getActorNeighbours({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getActorNeighbours(params));
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

type SharedArtist = {
  id: string;
  name: string;
  picture: string | null;
  uri: string | null;
};

type NeighbourRow = {
  user_id: string;
  shared_count: number;
  did: string;
  handle: string;
  display_name: string | null;
  avatar: string | null;
  target_artist_count: number;
  top_artists: SharedArtist[];
};

const retrieve = ({
  params,
  ctx,
}: {
  params: QueryParams;
  ctx: Context;
}): Effect.Effect<{ data: Neighbour[] }, Error> => {
  return readQuery("Failed to retrieve neighbours", async (db) => {
    const user = await db
      .select({ id: tables.users.id })
      .from(tables.users)
      .where(
        or(
          eq(tables.users.did, params.did),
          eq(tables.users.handle, params.did),
        ),
      )
      .execute()
      .then((rows) => rows[0]);

    if (!user) throw new Error("User not found");

    // user_artists_mv holds distinct (user, artist) pairs with play counts
    // (0024_user_artists_mv.sql), refreshed periodically by server.ts.
    const result = await db.execute(neighboursQuery(user.id));

    const rows = result.rows as NeighbourRow[];

    const data: Neighbour[] = rows.map((row) => ({
      id: row.user_id,
      userId: row.user_id,
      did: row.did,
      handle: row.handle,
      displayName: row.display_name ?? "",
      avatar: row.avatar ?? "",
      sharedArtistsCount: row.shared_count,
      similarityScore:
        row.target_artist_count > 0
          ? row.shared_count / row.target_artist_count
          : 0,
      topSharedArtistNames: row.top_artists.map((a) => a.name),
      topSharedArtistsDetails: row.top_artists,
    }));

    return { data };
  });
};

const presentation = ({
  data,
}: {
  data: Neighbour[];
}): Effect.Effect<{ neighbours: NeighbourViewBasic[] }, never> => {
  return Effect.sync(() => ({ neighbours: data as NeighbourViewBasic[] }));
};

type Neighbour = {
  id: string;
  userId: string;
  did: string;
  handle: string;
  displayName: string;
  avatar: string;
  sharedArtistsCount: number;
  similarityScore: number;
  topSharedArtistNames: string[];
  topSharedArtistsDetails: SharedArtist[];
};
