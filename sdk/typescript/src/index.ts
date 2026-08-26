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
  RockskyLibrary,
  type LibrarySong,
  type LibraryPlaylist,
  type LibraryPlaylistMutation,
  type LibraryPlaylistResponse,
  type LibraryPlaylistsResponse,
} from "./library.js";
export {
  Agent,
  MAX_SAFE_WRITES_PER_HOUR,
  DEFAULT_MATCH_SONG_PER_HOUR,
  type ScrobbleInput,
  type ScrobbleMatchInput,
  type SongInput,
  type AlbumInput,
  type ArtistInput,
  type RateLimitOptions,
  type RateLimitState,
} from "./agent.js";
// The dedup index (classic-level, Node-only) lives on the `@rocksky/sdk/dedup`
// subpath so this root entry stays browser-safe.
export type { IndexStats, RockskyIndex } from "./dedup.js";
export { runJetstream, DEFAULT_JETSTREAM_SERVERS, type JetstreamOptions } from "./jetstream.js";
export {
  RemotePlayer,
  DEFAULT_REMOTE_WS,
  type RemotePlayerOptions,
  type RemotePlayerHandlers,
  type RemoteNowPlaying,
  type RemoteQueueItem,
  type EnqueueCommand,
} from "./remote-player.js";
export {
  RemoteController,
  type RemoteControllerOptions,
  type RemoteControllerEvents,
  type RemoteDevice,
  type RemoteStatus,
} from "./remote-controller.js";
export {
  Filter,
  SongFields,
  AlbumFields,
  ArtistFields,
  PlaylistFields,
  ScrobbleFields,
  type FilterValue,
} from "./filter.js";
export { songHash, albumHash, artistHash } from "./hash.js";
export { RockskyError } from "./errors.js";
export type * from "./generated/types.js";
