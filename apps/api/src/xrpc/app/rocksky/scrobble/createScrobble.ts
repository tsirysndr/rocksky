import { SpanStatusCode, trace } from "@opentelemetry/api";
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
import {
  enqueueSubmission,
  SubmissionUnavailable,
} from "lib/durableSubmission";
import { env } from "lib/env";
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
    handler: async ({ input, auth, req }) => {
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

        // Reject an expired session before accepting durable work.
        const agent = await createAgent(ctx.oauthClient, did);
        if (!agent) {
          span?.addEvent("pds_session_expired");
          consola.warn(
            `[createScrobble] no agent for ${chalk.cyan(did)}, returning 401`,
          );
          return { status: 401, message: pdsSessionExpired.message };
        }

        const explicitKey = req.headers["idempotency-key"];
        if (
          explicitKey &&
          (typeof explicitKey !== "string" || explicitKey.length > 512)
        )
          return { status: 400, message: "Invalid Idempotency-Key." };
        const submissionId = await enqueueSubmission(
          { url: env.SUBMISSIONS_URL, secret: env.SUBMISSIONS_SECRET },
          did,
          track,
          typeof explicitKey === "string" ? explicitKey : undefined,
          req.headers["x-rocksky-mirror-provider"] === "tealfm",
        );
        span?.setAttribute("submission.id", submissionId);

        return { encoding: "application/json" as const, body: {} };
      } catch (err) {
        if (err instanceof SubmissionUnavailable)
          return { status: 503, message: err.message };
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
