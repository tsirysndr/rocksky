export {
  RockskyClient,
  RockskyClientBuilder,
  createClient,
} from "./client";
export {
  RockskyError,
  RockskyHttpError,
  RockskyTimeoutError,
  RockskyAuthError,
} from "./errors";
export {
  pipe,
  map,
  tap,
  withRetry,
  withTimeout,
  withFallback,
  catchError,
  type Op,
} from "./pipe";
export {
  DEFAULT_BASE_URL,
  type AuthProvider,
  type ClientOptions,
  type FetchLike,
  type Json,
  type Pagination,
  type RequestOptions,
} from "./types";
export {
  paginate,
  type PageOpts,
  type PageResult,
  type PaginateArgs,
} from "./paginate";
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
} from "./realtime";

export type {
  GetProfileParams,
  ActorPagedParams,
  ActorRangeParams,
} from "./namespaces/actor";
export type {
  CreateScrobbleInput,
  GetScrobblesParams,
} from "./namespaces/scrobble";
export type {
  GetSongParams,
  GetSongsParams,
  MatchSongParams,
  CreateSongInput,
} from "./namespaces/song";
export type { GetAlbumsParams } from "./namespaces/album";
export type {
  GetArtistsParams,
  ArtistListenersParams,
  GetArtistTracksParams,
} from "./namespaces/artist";
export type {
  ListApikeysParams,
  CreateApikeyInput,
  UpdateApikeyInput,
} from "./namespaces/apikey";
export type {
  ScrobblesChartParams,
  TopChartParams,
} from "./namespaces/charts";
export type {
  FollowListParams,
  KnownFollowersParams,
} from "./namespaces/graph";
export type { RecommendParams } from "./namespaces/feed";
export type { LikeInput } from "./namespaces/like";
export type { PutMirrorSourceInput } from "./namespaces/mirror";
