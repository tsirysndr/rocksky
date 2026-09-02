import { consola } from "consola";
import type { Context } from "context";
import { eq, or, sql } from "drizzle-orm";
import { Cache, Data, Duration, Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { NeighbourViewBasic } from "lexicon/types/app/rocksky/actor/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/actor/getActorNeighbours";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const cache = Cache.make({
    capacity: 100,
    timeToLive: Duration.minutes(10),
    lookup: (params: QueryParams) =>
      pipe(
        { params, ctx },
        retrieve,
        Effect.flatMap(presentation),
        Effect.retry({ times: 3 }),
        Effect.timeout("120 seconds"),
      ),
  });

  const getActorNeighbours = (params: QueryParams) =>
    pipe(
      cache,
      Effect.flatMap((c) => c.get(Data.struct({ ...params }))),
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
  return Effect.tryPromise({
    try: async () => {
      const user = await ctx.db
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
      const result = await ctx.db.execute(sql`
        WITH target AS (
          SELECT artist_id
          FROM user_artists_mv
          WHERE user_id = ${user.id}
        ),
        neighbours AS (
          SELECT ua.user_id, count(*)::int AS shared_count
          FROM user_artists_mv ua
          JOIN target t ON t.artist_id = ua.artist_id
          WHERE ua.user_id <> ${user.id}
          GROUP BY ua.user_id
          ORDER BY shared_count DESC
          LIMIT 50
        ),
        top_shared AS (
          SELECT
            ua.user_id,
            ua.artist_id,
            row_number() OVER (
              PARTITION BY ua.user_id
              ORDER BY ua.play_count DESC
            ) AS rn
          FROM user_artists_mv ua
          JOIN neighbours n ON n.user_id = ua.user_id
          JOIN target t ON t.artist_id = ua.artist_id
        )
        SELECT
          n.user_id,
          n.shared_count,
          u.did,
          u.handle,
          u.display_name,
          u.avatar,
          (SELECT count(*)::int FROM target) AS target_artist_count,
          coalesce(
            json_agg(
              json_build_object(
                'id', a.xata_id,
                'name', a.name,
                'picture', a.picture,
                'uri', a.uri
              )
              ORDER BY ts.rn
            ) FILTER (WHERE a.xata_id IS NOT NULL),
            '[]'
          ) AS top_artists
        FROM neighbours n
        JOIN users u ON u.xata_id = n.user_id
        LEFT JOIN top_shared ts ON ts.user_id = n.user_id AND ts.rn <= 5
        LEFT JOIN artists a ON a.xata_id = ts.artist_id
        GROUP BY n.user_id, n.shared_count, u.did, u.handle, u.display_name, u.avatar
        ORDER BY n.shared_count DESC
      `);

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
    },
    catch: (error) => new Error(`Failed to retrieve neighbours: ${error}`),
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
