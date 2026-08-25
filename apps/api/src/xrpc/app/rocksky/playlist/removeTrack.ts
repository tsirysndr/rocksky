import type { HandlerAuth } from "@atproto/xrpc-server";
import { consola } from "consola";
import type { Context } from "context";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { QueryParams } from "lexicon/types/app/rocksky/playlist/removeTrack";
import { createAgent } from "lib/agent";
import { removeTrackFromPlaylist } from "playlists/playlists.service";

export default function (server: Server, ctx: Context) {
  const removeTrack = (params: QueryParams, auth: HandlerAuth) =>
    pipe(
      { params, ctx, did: auth.credentials?.did },
      remove,
      Effect.timeout("30 seconds"),
    );

  server.app.rocksky.playlist.removeTrack({
    auth: ctx.authVerifier,
    handler: async ({ params, auth }) => {
      await Effect.runPromise(removeTrack(params, auth));
    },
  });
}

const remove = ({
  params,
  ctx,
  did,
}: {
  params: QueryParams;
  ctx: Context;
  did?: string;
}): Effect.Effect<void, Error> =>
  Effect.tryPromise({
    try: async () => {
      if (!did) {
        throw new Error("User is not authenticated");
      }
      const agent = await createAgent(ctx.oauthClient, did);
      if (!agent) {
        throw new Error("Unauthorized");
      }
      await removeTrackFromPlaylist(
        ctx,
        agent,
        did,
        params.uri,
        params.songUri,
        params.index,
      );
      consola.info(
        `Removed ${params.index !== undefined ? `#${params.index}` : params.songUri} from ${params.uri}`,
      );
    },
    catch: (error) =>
      new Error(`Failed to remove track from playlist: ${error}`),
  });
