import type { HandlerAuth } from "@atproto/xrpc-server";
import { consola } from "consola";
import type { Context } from "context";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type {
  OutputSchema,
  QueryParams,
} from "lexicon/types/app/rocksky/playlist/updatePlaylist";
import { createAgent } from "lib/agent";
import { updatePlaylist as putPlaylist } from "playlists/playlists.service";

export default function (server: Server, ctx: Context) {
  const updatePlaylist = (params: QueryParams, auth: HandlerAuth) =>
    pipe(
      { params, ctx, did: auth.credentials?.did },
      update,
      Effect.timeout("30 seconds"),
    );

  server.app.rocksky.playlist.updatePlaylist({
    auth: ctx.authVerifier,
    handler: async ({ params, auth }) => {
      const result = await Effect.runPromise(updatePlaylist(params, auth));
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const update = ({
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
      const updated = await putPlaylist(agent, did, params.uri, {
        name: params.name,
        description: params.description,
        pictureUrl: params.pictureUrl,
      });
      consola.info(`Playlist record updated: ${updated.uri}`);
      return updated;
    },
    catch: (error) => new Error(`Failed to update playlist: ${error}`),
  });
