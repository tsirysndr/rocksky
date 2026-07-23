/**
 * @rocksky/sdk — the official TypeScript SDK for Rocksky, built on atcute.
 *
 * {@link RockskyClient} does unauthenticated AppView reads; {@link Agent} logs
 * in with an app password and writes app.rocksky.* records to the user's PDS
 * (scrobble, like, follow, shout, now-playing). With a {@link RockskyIndex}
 * attached it prevents duplicates, backfilled from the repo CAR
 * ({@link Agent.syncRepo}) and kept live off the Jetstream firehose
 * ({@link Agent.hydrateFromJetstream}).
 */
export { RockskyClient, DEFAULT_APPVIEW, Interval } from "./client.js";
export type { DateInterval } from "./client.js";
export {
  Agent,
  type ScrobbleInput,
  type ScrobbleMatchInput,
  type SongInput,
  type AlbumInput,
  type ArtistInput,
} from "./agent.js";
export { RockskyIndex, totalIndexed, type IndexStats } from "./dedup.js";
export { runJetstream, DEFAULT_JETSTREAM_SERVERS, type JetstreamOptions } from "./jetstream.js";
export { songHash, albumHash, artistHash } from "./hash.js";
export { RockskyError } from "./errors.js";
export type * from "./generated/types.js";
