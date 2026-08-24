import type { HandlerAuth } from "@atproto/xrpc-server";
import type { Context } from "context";
import type { Server } from "lexicon";
import {
  callNavidrome,
  libraryErrorResponse,
  libraryMethod,
} from "lib/navidrome";
import { mirrorCreate, reportMirror } from "library/playlist-mirror";

export default function (server: Server, ctx: Context) {
  server.app.rocksky.library.createPlaylist(
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

        let body: Record<string, unknown>;
        try {
          body = (await callNavidrome(
            ctx,
            "createPlaylist",
            did,
            input?.body ?? {},
          )) as Record<string, unknown>;
        } catch (err) {
          return libraryErrorResponse("createPlaylist", err);
        }

        // The playlist exists in the library now, so this reply is a success
        // no matter how the mirror goes — see library/playlist-mirror.
        const playlist = body.playlist as
          | (Record<string, unknown> & { id?: string })
          | undefined;
        if (playlist?.id) {
          const playlistId = playlist.id;
          const atprotoError = await reportMirror(
            "createPlaylist",
            async () => {
              playlist.uri = await mirrorCreate(ctx, did, playlistId);
            },
          );
          if (atprotoError) body.atprotoError = atprotoError;
        }

        return { encoding: "application/json" as const, body };
      },
    }),
  );
}
