import { consola } from "consola";
import chalk from "chalk";
import type { Context } from "context";
import type { Server } from "lexicon";
import { createAgent } from "lib/agent";
import { type Track, trackSchema } from "types/track";
import { scrobbleTrack } from "nowplaying/nowplaying.service";

export default function (server: Server, ctx: Context) {
  server.app.rocksky.scrobble.createScrobble({
    auth: ctx.authVerifier,
    handler: async ({ input, auth }) => {
      const did = auth.credentials?.did;
      if (!did) {
        return { encoding: "application/json" as const, body: {} };
      }

      const parsed = trackSchema.safeParse(input.body);
      if (!parsed.success) {
        consola.warn(
          `[createScrobble] invalid input for ${chalk.cyan(did)}:`,
          parsed.error.flatten(),
        );
        return { encoding: "application/json" as const, body: {} };
      }

      const track: Track = parsed.data;

      // Fire-and-forget — the client doesn't need to wait for the full
      // scrobble pipeline (ATProto puts, MusicBrainz hydration, etc.)
      createAgent(ctx.oauthClient, did)
        .then((agent) => scrobbleTrack(ctx, track, agent, did))
        .then(() =>
          consola.info(
            `[createScrobble] scrobble created for ${chalk.cyan(track.title)}`,
          ),
        )
        .catch((err) =>
          consola.error(`[createScrobble] failed for ${chalk.cyan(did)}:`, err),
        );

      return { encoding: "application/json" as const, body: {} };
    },
  });
}
