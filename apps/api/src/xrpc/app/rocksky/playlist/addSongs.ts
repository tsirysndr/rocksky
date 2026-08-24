import type { HandlerAuth } from "@atproto/xrpc-server";
import type { Context } from "context";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type {
  OutputSchema,
  QueryParams,
} from "lexicon/types/app/rocksky/playlist/addSongs";
import { createAgent } from "lib/agent";
import { addSongsToPlaylist } from "playlists/playlists.service";

export default function (server: Server, ctx: Context) {
  const addSongs = (params: QueryParams, auth: HandlerAuth) =>
    pipe(
      { params, ctx, did: auth.credentials?.did },
      add,
      Effect.timeout("60 seconds"),
    );

  server.app.rocksky.playlist.addSongs({
    auth: ctx.authVerifier,
    handler: async ({ params, auth }) => {
      const result = await Effect.runPromise(addSongs(params, auth));
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const add = ({
  params,
  ctx,
  did,
}: {
  params: QueryParams;
  ctx: Context;
  did?: string;
}): Effect.Effect<OutputSchema, Error> =>
  Effect.tryPromise({
    try: async () => {
      if (!did) {
        throw new Error("User is not authenticated");
      }
      const agent = await createAgent(ctx.oauthClient, did);
      if (!agent) {
        throw new Error("Unauthorized");
      }
      const uris = await addSongsToPlaylist(
        ctx,
        agent,
        did,
        params.uri,
        params.songs,
      );
      return { uris };
    },
    // InvalidRequestError already carries a status and a usable message
    // ("Only the playlist owner…", "Song not found: …"); wrapping it in a plain
    // Error turned every one of those into an opaque 500.
    catch: (error) =>
      error instanceof Error
        ? error
        : new Error(`Failed to add songs to playlist: ${error}`),
  });
