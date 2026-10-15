import { Hono } from "hono";
import { ctx } from "context";
import { createAgent, pdsSessionExpired } from "lib/agent";
import {
  submissionRecordKey,
  validSubmissionSecret,
} from "lib/durableSubmission";
import { env } from "lib/env";
import {
  ScrobbleBlockedError,
  ScrobbleBotFlaggedError,
} from "lib/scrobbleGuard";
import { scrobbleTrack } from "nowplaying/nowplaying.service";
import { trackSchema } from "types/track";

import * as TealPlay from "lexicon/types/fm/teal/feed/play";
import { publishTealRecord } from "tealfm/publication";
import { isTealPushEnabled } from "tealfm/pushEnabled";

const app = new Hono();

app.post("/tealfm/process", async (c) => {
  if (
    !validSubmissionSecret(
      c.req.header("x-rocksky-submissions-secret"),
      env.SUBMISSIONS_SECRET,
    )
  )
    return c.json({ error: "Unauthorized" }, 401);
  const body = await c.req.json();
  if (
    typeof body.did !== "string" ||
    !body.did.startsWith("did:") ||
    typeof body.submissionId !== "string" ||
    !/^[a-f0-9]{64}$/.test(body.submissionId) ||
    !TealPlay.validateRecord(body.track).success ||
    !Number.isFinite(Date.parse(body.track?.playedTime))
  )
    return c.json({ error: "Invalid Teal submission" }, 400);
  let rkey: string;
  try {
    rkey = submissionRecordKey(body.recordKey);
  } catch {
    return c.json({ error: "Invalid stored record key" }, 400);
  }
  try {
    // Recheck preferences on every attempt, including after long outages.
    if (await isTealPushEnabled(body.did)) {
      const agent = await createAgent(ctx.oauthClient, body.did);
      if (!agent) return c.json(pdsSessionExpired, 401);
      await publishTealRecord(agent, body.track, rkey);
    }
    return c.json({ status: "published", submissionId: body.submissionId });
  } catch {
    return c.json({ error: "Teal publication failed" }, 503);
  }
});

// Internal worker callback, deliberately synchronous. A 200 means the PDS write
// (or an already-persisted duplicate) was confirmed, never just started.
app.post("/process", async (c) => {
  if (
    !validSubmissionSecret(
      c.req.header("x-rocksky-submissions-secret"),
      env.SUBMISSIONS_SECRET,
    )
  )
    return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json();
  if (
    typeof body.did !== "string" ||
    !body.did.startsWith("did:") ||
    typeof body.submissionId !== "string" ||
    !/^[a-f0-9]{64}$/.test(body.submissionId)
  )
    return c.json({ error: "Invalid submission" }, 400);
  const track = trackSchema.safeParse(body.track);
  if (!track.success || !track.data.timestamp)
    return c.json({ error: "Invalid stored track" }, 400);
  let rkey: string;
  try {
    rkey = submissionRecordKey(body.recordKey);
  } catch {
    return c.json({ error: "Invalid stored record key" }, 400);
  }

  const agent = await createAgent(ctx.oauthClient, body.did);
  if (!agent) return c.json(pdsSessionExpired, 401);
  try {
    await scrobbleTrack(ctx, track.data, agent, body.did, false, undefined, {
      id: body.submissionId,
      rkey,
      skipTeal: body.skipTeal === true,
    });
    return c.json({ status: "published", submissionId: body.submissionId });
  } catch (error) {
    if (error instanceof ScrobbleBotFlaggedError)
      return c.json({ error: "Account flagged as bot" }, 403);
    if (error instanceof ScrobbleBlockedError) {
      c.header("Retry-After", String(error.retryAfter));
      return c.json({ error: "Scrobble temporarily blocked" }, 429);
    }
    // The worker retains/retries the job; don't report success for an exception.
    return c.json({ error: "Publication failed" }, 503);
  }
});

export default app;
