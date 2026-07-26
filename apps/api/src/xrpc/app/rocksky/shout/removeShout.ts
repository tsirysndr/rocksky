import type { HandlerAuth } from "@atproto/xrpc-server";
import { consola } from "consola";
import type { Context } from "context";
import { eq, inArray } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { QueryParams } from "lexicon/types/app/rocksky/shout/removeShout";
import { createAgent } from "lib/agent";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const removeShout = (params: QueryParams, auth: HandlerAuth) =>
    pipe(
      handleRemove({ params, ctx, did: auth.credentials?.did }),
      Effect.flatMap(presentation),
      Effect.timeout("15 seconds"),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({});
      }),
    );
  server.app.rocksky.shout.removeShout({
    auth: ctx.authVerifier,
    handler: async ({ params, auth }) => {
      const result = await Effect.runPromise(removeShout(params, auth));
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const handleRemove = ({
  params,
  ctx,
  did,
}: {
  params: QueryParams;
  ctx: Context;
  did?: string;
}) =>
  Effect.tryPromise({
    try: async () => {
      if (!did) {
        throw new Error("User is not authenticated");
      }
      if (!params.id) {
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

      const agent = await createAgent(ctx.oauthClient, did);
      if (!agent) {
        throw new Error("Unauthorized");
      }

      // `id` may be the shout's at-uri or its database id.
      const column = params.id.startsWith("at://")
        ? tables.shouts.uri
        : tables.shouts.id;
      const shout = await ctx.db
        .select()
        .from(tables.shouts)
        .where(eq(column, params.id))
        .limit(1)
        .then((rows) => rows[0]);
      if (!shout) {
        throw new Error("Shout not found");
      }

      if (shout.authorId !== user.id) {
        throw new Error("Forbidden");
      }

      const replies = await ctx.db
        .select({ id: tables.shouts.id })
        .from(tables.shouts)
        .where(eq(tables.shouts.parentId, shout.id));
      const replyIds = replies.map((r) => r.id);

      // Delete related records in the correct order (children first).
      if (replyIds.length) {
        await ctx.db
          .delete(tables.shoutLikes)
          .where(inArray(tables.shoutLikes.shoutId, replyIds));
        await ctx.db
          .delete(tables.shoutReports)
          .where(inArray(tables.shoutReports.shoutId, replyIds));
        await ctx.db
          .delete(tables.profileShouts)
          .where(inArray(tables.profileShouts.shoutId, replyIds));
      }

      await ctx.db
        .delete(tables.profileShouts)
        .where(eq(tables.profileShouts.shoutId, shout.id));
      await ctx.db
        .delete(tables.shoutLikes)
        .where(eq(tables.shoutLikes.shoutId, shout.id));
      await ctx.db
        .delete(tables.shoutReports)
        .where(eq(tables.shoutReports.shoutId, shout.id));

      if (replyIds.length) {
        await ctx.db
          .delete(tables.shouts)
          .where(inArray(tables.shouts.id, replyIds));
      }
      await ctx.db.delete(tables.shouts).where(eq(tables.shouts.id, shout.id));

      await agent.com.atproto.repo.deleteRecord({
        repo: agent.assertDid,
        collection: "app.rocksky.shout",
        rkey: shout.uri.split("/").pop(),
      });

      return shout;
    },
    catch: (error) => new Error(`Failed to remove shout: ${error}`),
  });

// The lexicon output is a ShoutView; this mutation only confirms success, so
// (like the sibling shout handlers) it returns an empty object.
const presentation = () => Effect.sync(() => ({}));
