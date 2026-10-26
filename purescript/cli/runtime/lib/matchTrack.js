import { RockskyClient } from "../client.js";
import { ctx } from "../context.js";
import { logger } from "../logger.js";
async function matchTrack(track, artist, album) {
  let match;
  const cacheKey = album ? `${track} - ${artist} - ${album}` : `${track} - ${artist}`;
  const cached = await ctx.kv.getItem(cacheKey);
  const client = new RockskyClient();
  if (cached) {
    match = cached;
    client.matchSong(track, artist, album).then((newMatch) => {
      if (newMatch) {
        ctx.kv.setItem(cacheKey.toLowerCase(), newMatch);
      }
    });
  } else {
    match = await client.matchSong(track, artist, album);
    await ctx.kv.setItem(cacheKey.toLowerCase(), match);
  }
  if (!match.title || !match.artist) {
    logger.error`Failed to match track ${track} by ${artist}`;
    return null;
  }
  logger.info`💿 Matched track ${match.title} by ${match.artist}`;
  return match;
}
export {
  matchTrack
};
