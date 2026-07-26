import type { HandlerAuth } from "@atproto/xrpc-server";
import { consola } from "consola";
import type { Context } from "context";
import { and, eq } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { InputSchema } from "lexicon/types/app/rocksky/shout/reportShout";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const reportShout = (input: InputSchema, auth: HandlerAuth) =>
    pipe(
      handleReport({ input, ctx, did: auth.credentials?.did }),
      Effect.flatMap(presentation),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({});
      }),
    );
  server.app.rocksky.shout.reportShout({
    auth: ctx.authVerifier,
    handler: async ({ input, auth }) => {
      const result = await Effect.runPromise(reportShout(input.body, auth));
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const handleReport = ({
  input,
  ctx,
  did,
}: {
  input: InputSchema;
  ctx: Context;
  did?: string;
}) =>
  Effect.tryPromise({
    try: async () => {
      if (!did) {
        throw new Error("User is not authenticated");
      }
      if (!input.shoutId) {
        throw new Error("Missing shout id");
      }

      const user = await ctx.db
        .select()
        .from(tables.users)
        .where(eq(tables.users.did, did))
        .limit(1)
        .then((rows) => rows[0]);
      if (!user) {
        throw new Error("User not found");
      }

      // `shoutId` may be the shout's at-uri or its database id.
      const shout = await resolveShout(ctx, input.shoutId);
      if (!shout) {
        throw new Error("Shout not found");
      }

      const existingReport = await ctx.db
        .select()
        .from(tables.shoutReports)
        .where(
          and(
            eq(tables.shoutReports.userId, user.id),
            eq(tables.shoutReports.shoutId, shout.id),
          ),
        )
        .limit(1)
        .then((rows) => rows[0]);

      if (existingReport) {
        return existingReport;
      }

      return await ctx.db
        .insert(tables.shoutReports)
        .values({
          userId: user.id,
          shoutId: shout.id,
        })
        .returning()
        .then((rows) => rows[0]);
    },
    catch: (error) => new Error(`Failed to report shout: ${error}`),
  });

const resolveShout = async (ctx: Context, idOrUri: string) => {
  const column = idOrUri.startsWith("at://")
    ? tables.shouts.uri
    : tables.shouts.id;
  return ctx.db
    .select()
    .from(tables.shouts)
    .where(eq(column, idOrUri))
    .limit(1)
    .then((rows) => rows[0]);
};

// The lexicon output is a ShoutView; this mutation only confirms success, so
// (like the sibling like/dislike handlers) it returns an empty object.
const presentation = () => Effect.sync(() => ({}));
