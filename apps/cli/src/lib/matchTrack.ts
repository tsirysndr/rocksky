import { ctx } from "context";
import { eq, and, or } from "drizzle-orm";
import { logger } from "logger";
import schema from "schema";

export async function matchTrack(track: string, artist: string) {
  const [result] = await ctx.db
    .select()
    .from(schema.tracks)
    .where(
      or(
        and(eq(schema.tracks.title, track), eq(schema.tracks.artist, artist)),
        and(
          eq(schema.tracks.title, track),
          eq(schema.tracks.albumArtist, artist),
        ),
      ),
    )
    .execute();
  logger.info`>> matchTrack ${track}, ${artist}`;
  logger.info`>> matchTrack result \n ${result}`;
}
