import type { HandlerAuth } from "@atproto/xrpc-server";
import { consola } from "consola";
import type { Context } from "context";
import { eq } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { InputSchema } from "lexicon/types/app/rocksky/shout/replyShout";
import { createAgent } from "lib/agent";
import tables from "schema";
import { replyShout as replyShoutService } from "shouts/shouts.service";
import { shoutSchema } from "types/shout";

export default function (server: Server, ctx: Context) {
  const replyShout = (input: InputSchema, auth: HandlerAuth) =>
    pipe(
      handleReply({ input, ctx, did: auth.credentials?.did }),
      Effect.flatMap(presentation),
      Effect.timeout("15 seconds"),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({});
      }),
    );
  server.app.rocksky.shout.replyShout({
    auth: ctx.authVerifier,
    handler: async ({ input, auth }) => {
      const result = await Effect.runPromise(replyShout(input.body, auth));
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const handleReply = ({
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
        throw new Error("Missing parent shout id");
      }

      const parsed = shoutSchema.safeParse(input);
      if (!parsed.success) {
        throw new Error(`Invalid reply data: ${parsed.error.message}`);
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

      // `shoutId` may be the shout's at-uri or its database id; resolve to the
      // at-uri that the reply service expects.
      const parentUri = await resolveShoutUri(ctx, input.shoutId);
      if (!parentUri) {
        throw new Error("Parent shout not found");
      }

      await replyShoutService(ctx, parsed.data, parentUri, user, agent);
      return {};
    },
    catch: (error) => new Error(`Failed to reply to shout: ${error}`),
  });

const resolveShoutUri = async (
  ctx: Context,
  idOrUri: string,
): Promise<string | undefined> => {
  if (idOrUri.startsWith("at://")) {
    return idOrUri;
  }
  const shout = await ctx.db
    .select({ uri: tables.shouts.uri })
    .from(tables.shouts)
    .where(eq(tables.shouts.id, idOrUri))
    .limit(1)
    .then((rows) => rows[0]);
  return shout?.uri;
};

const presentation = () => Effect.sync(() => ({}));
