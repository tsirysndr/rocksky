import type { Context } from "context";
import type { Server } from "lexicon";
import type { OutputSchema } from "lexicon/types/app/rocksky/event/getEvents";
import { listEvents, viewerDid } from "lib/eventView";

export default function (server: Server, ctx: Context) {
  server.app.rocksky.event.getEvents({
    auth: ctx.authVerifier,
    handler: async ({ params, auth }) => {
      const events = await listEvents(ctx, params, viewerDid(auth));
      return {
        encoding: "application/json" as const,
        body: { events } satisfies OutputSchema,
      };
    },
  });
}
