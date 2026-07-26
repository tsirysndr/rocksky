import type { HandlerAuth } from "@atproto/xrpc-server";
import { consola } from "consola";
import type { Context } from "context";
import { eq } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { InputSchema } from "lexicon/types/app/rocksky/like/likeSong";
import { createAgent } from "lib/agent";
import { likeTrack } from "lovedtracks/lovedtracks.service";
import tables from "schema";
import type { Track } from "types/track";

export default function (server: Server, ctx: Context) {
  const likeSong = (input: InputSchema, auth: HandlerAuth) =>
    pipe(
      like({ input, ctx, did: auth.credentials?.did }),
      Effect.flatMap(presentation),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({});
      }),
    );
  server.app.rocksky.like.likeSong({
    auth: ctx.authVerifier,
    handler: async ({ input, auth }) => {
      const result = await Effect.runPromise(likeSong(input.body, auth));
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const like = ({
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

      const result = await ctx.db
        .select()
        .from(tables.tracks)
        .where(eq(tables.tracks.uri, input.uri))
        .limit(1)
        .then((rows) => rows[0]);
      if (!result) {
        throw new Error("Track not found");
      }

      const track: Track = {
        title: result.title,
        artist: result.artist,
        album: result.album,
        albumArt: result.albumArt,
        albumArtist: result.albumArtist,
        trackNumber: result.trackNumber,
        duration: result.duration,
        composer: result.composer,
        lyrics: result.lyrics,
        discNumber: result.discNumber,
      };
      await likeTrack(ctx, track, user, agent);
      return {};
    },
    catch: (error) => new Error(`Failed to like song: ${error}`),
  });

const presentation = () => Effect.sync(() => ({}));
