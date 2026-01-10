import { ctx } from "context";
import { logger } from "logger";
import schema from "schema";

export async function matchTrack(track: string, artist: string) {
  await ctx.db
    .select()
    .from(schema.tracks)

    .execute();
  logger.info`>> matchTrack ${track}, ${artist}`;
}
