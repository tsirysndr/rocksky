import type { HandlerAuth } from "@atproto/xrpc-server";
import { consola } from "consola";
import type { Context } from "context";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type {
  OutputSchema,
  QueryParams,
} from "lexicon/types/app/rocksky/playlist/createPlaylist";
import { createAgent } from "lib/agent";
import { createPlaylist as publishPlaylist } from "playlists/playlists.service";

export default function (server: Server, ctx: Context) {
  const createPlaylist = (params: QueryParams, auth: HandlerAuth) =>
    pipe(
      { params, ctx, did: auth.credentials?.did },
      create,
      Effect.timeout("30 seconds"),
    );

  server.app.rocksky.playlist.createPlaylist({
    auth: ctx.authVerifier,
    handler: async ({ params, auth }) => {
      const result = await Effect.runPromise(createPlaylist(params, auth));
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

/**
 * Creates the playlist as an `app.rocksky.playlist` record on the caller's PDS
 * and returns its AT-URI. The `playlists` row follows once jetstream sees the
 * commit — nothing here writes to Postgres, which is what keeps the repo the
 * only thing that can put a playlist in the database.
 */
const create = ({
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
      const created = await publishPlaylist(agent, {
        name: params.name,
        description: params.description,
        pictureUrl: params.pictureUrl,
      });
      consola.info(`Playlist record created: ${created.uri}`);
      return created;
    },
    catch: (error) => new Error(`Failed to create playlist: ${error}`),
  });
