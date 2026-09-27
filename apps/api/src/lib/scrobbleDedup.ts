import { createHash, randomUUID } from "node:crypto";

// One sorted set per listener/song, with listening time as the score. The
// check and reservation are atomic, including timestamps on either side of
// a minute boundary. Never prune by listening time: imports arrive unordered.
// The TTL bridges PDS publication and asynchronous Jetstream indexing; the
// database check remains the durable deduplication layer.
const RESERVE_SCROBBLE = `
local at = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
if redis.call('ZCOUNT', KEYS[1], at - window, at + window) > 0 then
  return 0
end
redis.call('ZADD', KEYS[1], at, ARGV[3])
redis.call('EXPIRE', KEYS[1], 300)
return 1
`;

type RedisEval = {
  eval(
    script: string,
    options: { keys: string[]; arguments: string[] },
  ): Promise<unknown>;
};

export async function reserveScrobble(
  redis: RedisEval,
  did: string,
  track: { title: string; artist: string; timestamp: number },
  windowSeconds: number,
): Promise<boolean> {
  const identity = createHash("sha256")
    .update(
      JSON.stringify([track.title.toLowerCase(), track.artist.toLowerCase()]),
    )
    .digest("hex");
  const result = await redis.eval(RESERVE_SCROBBLE, {
    keys: [`scrobble-window:v1:${did}:${identity}`],
    arguments: [String(track.timestamp), String(windowSeconds), randomUUID()],
  });
  return Number(result) === 1;
}
