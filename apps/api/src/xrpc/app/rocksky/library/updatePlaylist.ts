import type { HandlerAuth } from "@atproto/xrpc-server";
import type { Context } from "context";
import type { Server } from "lexicon";
import {
  callNavidrome,
  libraryErrorResponse,
  libraryMethod,
} from "lib/navidrome";
import {
  mirrorUpdate,
  reportMirror,
  songUriAtIndex,
} from "library/playlist-mirror";

export default function (server: Server, ctx: Context) {
  server.app.rocksky.library.updatePlaylist(
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
        const playlistId = params.playlistId as string | undefined;
        const name = params.name as string | undefined;
        const comment = params.comment as string | undefined;
        const songIdToAdd = params.songIdToAdd as string | undefined;
        const songIndexToRemove = params.songIndexToRemove as
          | number
          | undefined;

        // A track index only means something while the row is still there, so
        // resolve which song it points at before navidrome drops it.
        let removedSongUri: string | null = null;
        if (playlistId && typeof songIndexToRemove === "number") {
          try {
            removedSongUri = await songUriAtIndex(
              ctx,
              playlistId,
              songIndexToRemove,
            );
          } catch (err) {
            return libraryErrorResponse("updatePlaylist", err);
          }
        }

        let body: Record<string, unknown>;
        try {
          body = (await callNavidrome(
            ctx,
            "updatePlaylist",
            did,
            params,
          )) as Record<string, unknown>;
        } catch (err) {
          return libraryErrorResponse("updatePlaylist", err);
        }

        if (playlistId) {
          const atprotoError = await reportMirror(
            "updatePlaylist",
            async () => {
              body.uri = await mirrorUpdate(ctx, did, playlistId, {
                name,
                comment,
                songIdToAdd,
                removedSongUri,
              });
            },
          );
          if (atprotoError) body.atprotoError = atprotoError;
        }

        return { encoding: "application/json" as const, body };
      },
    }),
  );
}
