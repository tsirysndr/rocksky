import type { Context } from "../context.ts";
import { Effect, pipe } from "effect";
import tables from "../schema/mod.ts";
import { eq, desc } from "drizzle-orm";

export default function (ctx: Context, offset?: number, limit?: number) {
  return Effect.runPromise(
    pipe(
      retrieve({
        ctx,
        params: {
          offset: offset || 0,
          limit: limit || 20,
        },
      }),
      Effect.retry({ times: 3 }),
      Effect.timeout("120 seconds"),
      Effect.catchAll((error) =>
        Effect.fail(new Error(`Failed to retrieve scrobbles: ${error}`)),
      ),
    ),
  );
}

const retrieve = ({
  ctx,
  params,
}: {
  ctx: Context;
  params: { offset?: number; limit?: number };
}) => {
  return Effect.tryPromise({
    try: () =>
      ctx.db
        .select()
        .from(tables.scrobbles)
        .leftJoin(tables.tracks, eq(tables.scrobbles.trackId, tables.tracks.id))
        .leftJoin(tables.users, eq(tables.scrobbles.userId, tables.users.id))
        .orderBy(desc(tables.scrobbles.timestamp))
        .offset(params.offset || 0)
        .limit(params.limit || 20)
        .execute(),

    catch: (error) => new Error(`Failed to retrieve scrobbles: ${error}`),
  });
};
