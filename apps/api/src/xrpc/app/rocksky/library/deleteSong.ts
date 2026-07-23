import { consola } from "consola";
import type { Context } from "context";
import type { Server } from "lexicon";
import {
  deleteUploadsForTrack,
  UnknownUserError,
} from "uploads/delete.service";

// The authenticated user is taken from the JWT (auth.credentials.did) — never
// from a request param. The only input is the song id (track xata_id).
type DeleteReqCtx = {
  auth: { credentials?: { did?: string } };
  input?: { body?: { id?: string } };
};

export default function (server: Server, ctx: Context) {
  const config = {
    auth: ctx.authVerifier,
    handler: async (reqCtx: DeleteReqCtx) => {
      const did = reqCtx.auth.credentials?.did;
      if (!did) {
        return { status: 400, message: "Missing authenticated DID." };
      }
      const id = reqCtx.input?.body?.id;
      if (!id) {
        return { status: 400, message: "Missing song id." };
      }

      try {
        const deleted = await deleteUploadsForTrack(ctx, did, id);
        if (deleted === 0) {
          return {
            status: 404,
            message: "No uploaded song found for the user.",
          };
        }
        return {
          encoding: "application/json" as const,
          body: { status: "ok", deleted },
        };
      } catch (err) {
        if (err instanceof UnknownUserError) {
          return { status: 401, message: err.message };
        }
        consola.error("[library.deleteSong]", err);
        return { status: 500, message: "Internal error while deleting song." };
      }
    },
  };

  // The generated per-method config type is method-specific; widen to satisfy
  // it (runtime behaviour and lexicon input validation are unaffected).
  server.app.rocksky.library.deleteSong(config as unknown as never);
}
