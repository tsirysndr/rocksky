export {
  RockskyClient,
  RockskyClientBuilder,
  createClient,
} from "./client.js";
export {
  RockskyError,
  RockskyHttpError,
  RockskyTimeoutError,
  RockskyAuthError,
} from "./errors.js";
export {
  pipe,
  map,
  tap,
  withRetry,
  withTimeout,
  withFallback,
  catchError,
  type Op,
} from "./pipe.js";
export {
  DEFAULT_BASE_URL,
  type AuthProvider,
  type ClientOptions,
  type FetchLike,
  type Json,
  type Pagination,
  type RequestOptions,
} from "./types.js";
export {
  paginate,
  type PageOpts,
  type PageResult,
  type PaginateArgs,
} from "./paginate.js";
export {
  RealtimeClient,
  RealtimeClientBuilder,
  createRealtimeClient,
  type RealtimeOptions,
  type RealtimeEvent,
  type RealtimeEventMap,
  type ReconnectOptions,
  type WebSocketCtor,
  type WebSocketLike,
} from "./realtime.js";

export type * from "./generated/types.js";

export type {
  GetProfileParams,
  ActorPagedParams,
  ActorRangeParams,
} from "./namespaces/actor.js";
export type {
  CreateScrobbleInput,
  GetScrobblesParams,
} from "./namespaces/scrobble.js";
export type {
  GetSongParams,
  GetSongsParams,
  MatchSongParams,
  CreateSongInput,
} from "./namespaces/song.js";
export type { GetAlbumsParams } from "./namespaces/album.js";
export type {
  GetArtistsParams,
  ArtistListenersParams,
  GetArtistTracksParams,
} from "./namespaces/artist.js";
export type {
  ListApikeysParams,
  CreateApikeyInput,
  UpdateApikeyInput,
} from "./namespaces/apikey.js";
export type {
  ScrobblesChartParams,
  TopChartParams,
} from "./namespaces/charts.js";
export type {
  FollowListParams,
  KnownFollowersParams,
} from "./namespaces/graph.js";
export type { RecommendParams } from "./namespaces/feed.js";
export type { LikeInput } from "./namespaces/like.js";
export type { PutMirrorSourceInput } from "./namespaces/mirror.js";
