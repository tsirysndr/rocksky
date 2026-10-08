import { InvalidRequestError } from "@atproto/xrpc-server";
import type { Context } from "context";
import type { Server } from "lexicon";
import type { OutputSchema } from "lexicon/types/app/rocksky/event/getEvent";
import { findEvent, hydrateEvents, viewerDid } from "lib/eventView";

export default function (server: Server, ctx: Context) {
  server.app.rocksky.event.getEvent({
    auth: ctx.authVerifier,
    handler: async ({ params, auth }) => {
      const row = await findEvent(ctx, params.uri);
      if (!row) {
        throw new InvalidRequestError("Event not found", "NotFound");
      }
      const [event] = await hydrateEvents(ctx, [row], viewerDid(auth));
      return {
        encoding: "application/json" as const,
        body: event satisfies OutputSchema,
      };
    },
  });
}
