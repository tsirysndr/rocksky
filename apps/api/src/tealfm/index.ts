import type { Agent } from "@atproto/api";
import { createHash } from "node:crypto";
import type { MusicbrainzTrack } from "types/track";
import { env } from "lib/env";
import { enqueueTealSubmission } from "lib/durableSubmission";
import { isTealPushEnabled } from "./pushEnabled";
import { tealRecord } from "./publication";

async function publishPlayingNow(
  agent: Agent,
  track: MusicbrainzTrack,
  duration: number,
  identity?: string,
) {
  if (!(await isTealPushEnabled(agent.assertDid))) return;
  const key =
    identity ??
    createHash("sha256")
      .update(
        JSON.stringify([
          agent.assertDid,
          track.name.toLowerCase(),
          track.artist.map((a) => a.name.toLowerCase()),
          track.album.toLowerCase(),
          track.timestamp,
        ]),
      )
      .digest("hex");
  await enqueueTealSubmission(
    { url: env.SUBMISSIONS_URL, secret: env.SUBMISSIONS_SECRET },
    agent.assertDid,
    tealRecord(track, duration),
    key,
  );
}

export default { publishPlayingNow };
