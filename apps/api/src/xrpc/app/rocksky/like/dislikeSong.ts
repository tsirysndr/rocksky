import type { HandlerAuth } from "@atproto/xrpc-server";
import { consola } from "consola";
import type { Context } from "context";
import { eq } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { InputSchema } from "lexicon/types/app/rocksky/like/dislikeSong";
import { createAgent } from "lib/agent";
import { unLikeTrack } from "lovedtracks/lovedtracks.service";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const dislikeSong = (input: InputSchema, auth: HandlerAuth) =>
    pipe(
      dislike({ input, ctx, did: auth.credentials?.did }),
      Effect.flatMap(presentation),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({});
      }),
    );
  server.app.rocksky.like.dislikeSong({
    auth: ctx.authVerifier,
    handler: async ({ input, auth }) => {
      const result = await Effect.runPromise(dislikeSong(input.body, auth));
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const dislike = ({
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
      if (!input.uri) {
        throw new Error("Missing song uri");
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

      const track = await ctx.db
        .select()
        .from(tables.tracks)
        .where(eq(tables.tracks.uri, input.uri))
        .limit(1)
        .then((rows) => rows[0]);
      if (!track) {
        throw new Error("Track not found");
      }

      await unLikeTrack(ctx, track.sha256, user, agent);
      return {};
    },
    catch: (error) => new Error(`Failed to dislike song: ${error}`),
  });

const presentation = () => Effect.sync(() => ({}));
