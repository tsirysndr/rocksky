import { ctx } from "context";
import lovedTracks from "../schema/loved-tracks";

const likes = await ctx.db.select().from(lovedTracks).execute();

for (const like of likes) {
  const message = JSON.stringify({
    uri: like.uri,
    user_id: { xata_id: like.userId },
    track_id: { xata_id: like.trackId },
    xata_createdat: like.createdAt.toISOString(),
    xata_id: like.id,
    xata_updatedat: like.createdAt.toISOString(),
    xata_version: 0,
  });
  ctx.nc.publish("rocksky.like", Buffer.from(message));
}
