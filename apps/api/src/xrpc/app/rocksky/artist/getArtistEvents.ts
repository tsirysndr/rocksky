import type { Context } from "context";
import type { Server } from "lexicon";
import type { OutputSchema } from "lexicon/types/app/rocksky/artist/getArtistEvents";
import { listEvents, viewerDid } from "lib/eventView";

export default function (server: Server, ctx: Context) {
  server.app.rocksky.artist.getArtistEvents({
    auth: ctx.authVerifier,
    handler: async ({ params, auth }) => {
      const events = await listEvents(
        ctx,
        {
          artist: params.uri,
          includePast: params.includePast,
          limit: params.limit,
          offset: params.offset,
        },
        viewerDid(auth),
      );
      return {
        encoding: "application/json" as const,
        body: { events } satisfies OutputSchema,
      };
    },
  });
}
