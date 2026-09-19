import { context, SpanStatusCode, trace } from "@opentelemetry/api";
import chalk from "chalk";
import { consola } from "consola";
import type { Context } from "context";
import type { Server } from "lexicon";
import { createAgent, pdsSessionExpired } from "lib/agent";
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

const tracer = trace.getTracer("rocksky-xrpc");

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
      const span = trace.getActiveSpan();
      const did = auth.credentials?.did;
      if (!did) {
        span?.addEvent("missing_did");
        return { status: 400, message: "Missing authenticated DID." };
      }
      span?.setAttribute("user.did", did);

      // Final safety net: never let an unexpected throw crash the handler —
      // surface it as a 500 with a generic message instead.
      try {
        const parsed = trackSchema.safeParse(input.body);
        if (!parsed.success) {
          span?.addEvent("validation_failed");
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
        span?.setAttributes({
          "scrobble.track": track.title,
          "scrobble.artist": track.artist,
          "scrobble.album": track.album,
        });

        // Bail out synchronously with a comprehensive 429 if this user is
        // currently flagged as a suspected bot, so the client gets a real error
        // instead of a silent no-op.
        try {
          await assertNotBotFlagged(ctx, did);
          await assertNotScrobbleBlocked(ctx, did);
        } catch (err) {
          if (err instanceof ScrobbleBotFlaggedError) {
            span?.addEvent("rejected_bot_flagged");
            consola.warn(
              `[createScrobble] rejected bot-flagged account ${chalk.cyan(did)}`,
            );
            return { status: 429, message: scrobbleBotFlaggedMessage() };
          }
          if (err instanceof ScrobbleBlockedError) {
            span?.addEvent("rejected_scrobble_blocked", {
              "retry_after.seconds": err.retryAfter,
            });
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

        // The agent is resolved up front, unlike the rest of the pipeline: with
        // a dead PDS session there is nothing to write, and answering 200 here
        // told clients the scrobble was stored when it never left the process.
        // Mirrors what /now-playing already does. Everything after this point
        // stays fire-and-forget — the client doesn't need to wait for the full
        // scrobble pipeline (ATProto puts, MusicBrainz hydration, etc.)
        const agent = await createAgent(ctx.oauthClient, did);
        if (!agent) {
          span?.addEvent("pds_session_expired");
          consola.warn(
            `[createScrobble] no agent for ${chalk.cyan(did)}, returning 401`,
          );
          return { status: 401, message: pdsSessionExpired.message };
        }

        // The pipeline outlives the request span (fire-and-forget), so it
        // gets its own span that everything downstream (PDS puts, Postgres,
        // MusicBrainz) nests under.
        const pipelineSpan = tracer.startSpan("scrobbleTrack", {
          attributes: {
            "user.did": did,
            "scrobble.track": track.title,
            "scrobble.artist": track.artist,
          },
        });
        context
          .with(trace.setSpan(context.active(), pipelineSpan), () =>
            scrobbleTrack(ctx, track, agent, did),
          )
          .then(() => {
            pipelineSpan.setStatus({ code: SpanStatusCode.OK });
            consola.info(
              `[createScrobble] scrobble created for ${chalk.cyan(track.title)}`,
            );
          })
          .catch((err) => {
            // A guard trip on this scrobble sets the block for the *next*
            // request; it's expected, not an error worth paging on.
            if (err instanceof ScrobbleBlockedError) {
              pipelineSpan.addEvent("rate_guard_tripped", {
                "retry_after.seconds": err.retryAfter,
              });
              consola.warn(
                `[createScrobble] rate guard tripped for ${chalk.cyan(did)} — now blocked ${err.retryAfter}s`,
              );
              return;
            }
            pipelineSpan.recordException(err);
            pipelineSpan.setStatus({ code: SpanStatusCode.ERROR });
            consola.error(
              `[createScrobble] failed for ${chalk.cyan(did)}:`,
              err,
            );
          })
          .finally(() => pipelineSpan.end());

        return { encoding: "application/json" as const, body: {} };
      } catch (err) {
        span?.recordException(err as Error);
        span?.setStatus({ code: SpanStatusCode.ERROR });
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
