import { MatchTrackResult } from "lib/matchTrack";
import { logger } from "logger";
import dayjs from "dayjs";
import { createAgent } from "lib/agent";
import { getDidAndHandle } from "lib/getDidAndHandle";
import { Agent } from "node:http";
import { ctx } from "context";
import schema from "schema";
import { and, eq, gte, lte } from "drizzle-orm";

export async function publishScrobble(
  track: MatchTrackResult,
  timestamp?: number,
) {
  const [did, handle] = await getDidAndHandle();
  const agent: Agent = await createAgent(did, handle);
  const recentScrobble = await getRecentScrobble(did, track, timestamp);

  if (recentScrobble) {
    logger.info`${handle} Skipping scrobble for ${track.title} by ${track.artist} at ${timestamp ? dayjs.unix(timestamp).format("YYYY-MM-DD HH:mm:ss") : dayjs().format("YYYY-MM-DD HH:mm:ss")} (already scrobbled)`;
    return;
  }

  logger.info`${handle} Publishing scrobble for ${track.title} by ${track.artist} at ${timestamp ? dayjs.unix(timestamp).format("YYYY-MM-DD HH:mm:ss") : dayjs().format("YYYY-MM-DD HH:mm:ss")}`;
}

async function getRecentScrobble(
  did: string,
  track: MatchTrackResult,
  timestamp?: number,
) {
  const scrobbleTime = dayjs.unix(timestamp || dayjs().unix());
  return ctx.db
    .select({
      scrobble: schema.scrobbles,
      user: schema.users,
      track: schema.tracks,
    })
    .from(schema.scrobbles)
    .innerJoin(schema.users, eq(schema.scrobbles.userId, schema.users.id))
    .innerJoin(schema.tracks, eq(schema.scrobbles.trackId, schema.tracks.id))
    .where(
      and(
        eq(schema.users.did, did),
        eq(schema.tracks.title, track.title),
        eq(schema.tracks.artist, track.artist),
        gte(
          schema.scrobbles.timestamp,
          scrobbleTime.subtract(60, "seconds").toDate(),
        ),
        lte(
          schema.scrobbles.timestamp,
          scrobbleTime.add(60, "seconds").toDate(),
        ),
      ),
    )
    .limit(1)
    .then((rows) => rows[0]);
}
