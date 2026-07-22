import chalk from "chalk";
import { consola } from "consola";
import type { Context } from "context";
import type { Server } from "lexicon";
import { createAgent } from "lib/agent";
import {
  assertNotBotFlagged,
  assertNotScrobbleBlocked,
  ScrobbleBlockedError,
  ScrobbleBotFlaggedError,
  scrobbleBlockedMessage,
  scrobbleBotFlaggedMessage,
} from "lib/scrobbleGuard";
import { scrobbleTrack } from "nowplaying/nowplaying.service";
import { type Track, trackSchema } from "types/track";
import type { ZodError } from "zod";

// Turn a Zod validation failure into a single, human-readable line describing
// exactly which fields are wrong, e.g. "Invalid scrobble: albumArtist is
// Required; duration Expected number, received string".
function formatValidationError(error: ZodError): string {
  const { formErrors, fieldErrors } = error.flatten();
  const parts: string[] = [];

  for (const [field, messages] of Object.entries(fieldErrors)) {
    for (const message of messages ?? []) {
      parts.push(`${field} ${message}`);
    }
  }
  parts.push(...formErrors);

  return parts.length > 0
    ? `Invalid scrobble: ${parts.join("; ")}`
    : "Invalid scrobble input.";
}

export default function (server: Server, ctx: Context) {
  server.app.rocksky.scrobble.createScrobble({
    auth: ctx.authVerifier,
    handler: async ({ input, auth }) => {
      const did = auth.credentials?.did;
      if (!did) {
        return { status: 400, message: "Missing authenticated DID." };
      }

      // Final safety net: never let an unexpected throw crash the handler —
      // surface it as a 500 with a generic message instead.
      try {
        const parsed = trackSchema.safeParse(input.body);
        if (!parsed.success) {
          consola.warn(
            `[createScrobble] invalid input for ${chalk.cyan(did)}:`,
            parsed.error.flatten(),
          );
          return {
            status: 400,
            message: formatValidationError(parsed.error),
          };
        }

        const track: Track = parsed.data;

        // Bail out synchronously with a comprehensive 429 if this user is
        // currently flagged as a suspected bot, so the client gets a real error
        // instead of a silent no-op.
        try {
          await assertNotBotFlagged(ctx, did);
          await assertNotScrobbleBlocked(ctx, did);
        } catch (err) {
          if (err instanceof ScrobbleBotFlaggedError) {
            consola.warn(
              `[createScrobble] rejected bot-flagged account ${chalk.cyan(did)}`,
            );
            return { status: 429, message: scrobbleBotFlaggedMessage() };
          }
          if (err instanceof ScrobbleBlockedError) {
            consola.warn(
              `[createScrobble] blocked suspected bot ${chalk.cyan(did)} — retry after ${err.retryAfter}s`,
            );
            return {
              status: 429,
              message: scrobbleBlockedMessage(err.retryAfter),
            };
          }
          throw err;
        }

        // Fire-and-forget — the client doesn't need to wait for the full
        // scrobble pipeline (ATProto puts, MusicBrainz hydration, etc.)
        createAgent(ctx.oauthClient, did)
          .then((agent) => scrobbleTrack(ctx, track, agent, did))
          .then(() =>
            consola.info(
              `[createScrobble] scrobble created for ${chalk.cyan(track.title)}`,
            ),
          )
          .catch((err) => {
            // A guard trip on this scrobble sets the block for the *next*
            // request; it's expected, not an error worth paging on.
            if (err instanceof ScrobbleBlockedError) {
              consola.warn(
                `[createScrobble] rate guard tripped for ${chalk.cyan(did)} — now blocked ${err.retryAfter}s`,
              );
              return;
            }
            consola.error(
              `[createScrobble] failed for ${chalk.cyan(did)}:`,
              err,
            );
          });

        return { encoding: "application/json" as const, body: {} };
      } catch (err) {
        consola.error(
          `[createScrobble] unexpected error for ${chalk.cyan(did)}:`,
          err,
        );
        return {
          status: 500,
          message: "Internal error while creating scrobble.",
        };
      }
    },
  });
}
