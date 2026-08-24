import type { HandlerAuth } from "@atproto/xrpc-server";
import type { Context } from "context";
import type { Server } from "lexicon";
import {
  callNavidrome,
  libraryErrorResponse,
  libraryMethod,
} from "lib/navidrome";
import {
  mirrorDelete,
  playlistUriOf,
  reportMirror,
} from "library/playlist-mirror";

export default function (server: Server, ctx: Context) {
  server.app.rocksky.library.deletePlaylist(
    libraryMethod({
      auth: ctx.authVerifier,
      handler: async ({
        input,
        auth,
      }: {
        input?: { body?: Record<string, unknown> };
        auth: HandlerAuth;
      }) => {
        const did = auth.credentials?.did;
        if (!did) {
          return { status: 400, message: "Missing authenticated DID." };
        }

        const params = input?.body ?? {};
        const playlistId = params.id as string | undefined;

        // Deleting the playlist takes the link to its record with it, so read
        // the AT-URI while the row still exists. navidrome rejects non-owners,
        // and this is only a read, so it is safe to do first.
        let uri: string | null = null;
        if (playlistId) {
          try {
            uri = await playlistUriOf(ctx, playlistId);
          } catch (err) {
            return libraryErrorResponse("deletePlaylist", err);
          }
        }

        let body: Record<string, unknown>;
        try {
          body = (await callNavidrome(
            ctx,
            "deletePlaylist",
            did,
            params,
          )) as Record<string, unknown>;
        } catch (err) {
          return libraryErrorResponse("deletePlaylist", err);
        }

        if (uri) {
          const playlistUri = uri;
          const atprotoError = await reportMirror("deletePlaylist", () =>
            mirrorDelete(ctx, did, playlistUri),
          );
          if (atprotoError) body.atprotoError = atprotoError;
        }

        return { encoding: "application/json" as const, body };
      },
    }),
  );
}
