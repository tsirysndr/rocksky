import { buildConfig, type HttpClientConfig, xrpcCall } from "./http";
import {
  type PaginateArgs,
  paginate as paginateFn,
} from "./paginate";
import {
  RealtimeClient,
  type RealtimeOptions,
  createRealtimeClient,
} from "./realtime";
import { ActorNamespace } from "./namespaces/actor";
import { AlbumNamespace } from "./namespaces/album";
import { ApikeyNamespace } from "./namespaces/apikey";
import { ArtistNamespace } from "./namespaces/artist";
import { ChartsNamespace } from "./namespaces/charts";
import { DropboxNamespace } from "./namespaces/dropbox";
import { FeedNamespace } from "./namespaces/feed";
import { GoogleDriveNamespace } from "./namespaces/googledrive";
import { GraphNamespace } from "./namespaces/graph";
import { LikeNamespace } from "./namespaces/like";
import { MirrorNamespace } from "./namespaces/mirror";
import { PlayerNamespace } from "./namespaces/player";
import { PlaylistNamespace } from "./namespaces/playlist";
import { ScrobbleNamespace } from "./namespaces/scrobble";
import { ShoutNamespace } from "./namespaces/shout";
import { SongNamespace } from "./namespaces/song";
import { SpotifyNamespace } from "./namespaces/spotify";
import { StatsNamespace } from "./namespaces/stats";
import type { Call } from "./namespaces/_helpers";
import type {
  AuthProvider,
  ClientOptions,
  FetchLike,
  RequestOptions,
} from "./types";

export class RockskyClient {
  readonly config: HttpClientConfig;

  readonly actor: ActorNamespace;
  readonly album: AlbumNamespace;
  readonly apikey: ApikeyNamespace;
  readonly artist: ArtistNamespace;
  readonly charts: ChartsNamespace;
  readonly dropbox: DropboxNamespace;
  readonly feed: FeedNamespace;
  readonly googledrive: GoogleDriveNamespace;
  readonly graph: GraphNamespace;
  readonly like: LikeNamespace;
  readonly mirror: MirrorNamespace;
  readonly player: PlayerNamespace;
  readonly playlist: PlaylistNamespace;
  readonly scrobble: ScrobbleNamespace;
  readonly shout: ShoutNamespace;
  readonly song: SongNamespace;
  readonly spotify: SpotifyNamespace;
  readonly stats: StatsNamespace;

  constructor(options: ClientOptions = {}) {
    this.config = buildConfig(options);
    const call: Call = (nsid, method, opts) =>
      xrpcCall(this.config, nsid, method, opts ?? {});

    this.actor = new ActorNamespace(call);
    this.album = new AlbumNamespace(call);
    this.apikey = new ApikeyNamespace(call);
    this.artist = new ArtistNamespace(call);
    this.charts = new ChartsNamespace(call);
    this.dropbox = new DropboxNamespace(call);
    this.feed = new FeedNamespace(call);
    this.googledrive = new GoogleDriveNamespace(call);
    this.graph = new GraphNamespace(call);
    this.like = new LikeNamespace(call);
    this.mirror = new MirrorNamespace(call);
    this.player = new PlayerNamespace(call);
    this.playlist = new PlaylistNamespace(call);
    this.scrobble = new ScrobbleNamespace(call);
    this.shout = new ShoutNamespace(call);
    this.song = new SongNamespace(call);
    this.spotify = new SpotifyNamespace(call);
    this.stats = new StatsNamespace(call);
  }

  /** Build a one-off authenticated copy without mutating this client. */
  withAuth(auth: AuthProvider): RockskyClient {
    return new RockskyClient({
      ...this.optionsSnapshot(),
      auth,
    });
  }

  /** Build a copy with an overridden base URL. */
  withBaseUrl(baseUrl: string): RockskyClient {
    return new RockskyClient({
      ...this.optionsSnapshot(),
      baseUrl,
    });
  }

  /**
   * Open a realtime WebSocket connection to /ws.
   *
   *   const rt = client.realtime({ token, clientName: "my-app" });
   *   rt.on("message", m => console.log(m));
   *   await rt.connect();
   *
   * Defaults `baseUrl` to this client's base URL. Override anything by
   * passing the option, or use `RealtimeClient.builder()` for full control.
   */
  realtime(
    options: Omit<RealtimeOptions, "baseUrl"> &
      Partial<Pick<RealtimeOptions, "baseUrl">>,
  ): RealtimeClient {
    return createRealtimeClient({
      baseUrl: this.config.baseUrl,
      ...options,
    });
  }

  /**
   * Page through any limit/offset or cursor-based endpoint as an async iterable.
   *
   *   for await (const s of client.paginate({
   *     fetch: ({ limit, offset }) =>
   *       client.actor.getActorScrobbles({ did, limit, offset }),
   *     pageSize: 50,
   *   })) { ... }
   */
  paginate<T>(args: PaginateArgs<T>) {
    return paginateFn(args);
  }

  /** Direct escape hatch — call any XRPC endpoint by NSID. */
  xrpc<T = unknown>(
    nsid: string,
    method: "GET" | "POST" = "GET",
    opts: {
      params?: Record<string, unknown>;
      body?: unknown;
      requireAuth?: boolean;
    } & RequestOptions = {},
  ): Promise<T> {
    return xrpcCall<T>(this.config, nsid, method, opts);
  }

  static builder(): RockskyClientBuilder {
    return new RockskyClientBuilder();
  }

  private optionsSnapshot(): ClientOptions {
    return {
      baseUrl: this.config.baseUrl,
      auth: this.config.auth,
      fetch: this.config.fetch,
      headers: this.config.headers,
      timeoutMs: this.config.timeoutMs,
      retries: this.config.retries,
      retryDelayMs: this.config.retryDelayMs,
    };
  }
}

/**
 * Fluent builder.
 *
 *   const client = RockskyClient.builder()
 *     .baseUrl("https://api.rocksky.app")
 *     .auth(() => loadToken())
 *     .timeout(10_000)
 *     .retries(3)
 *     .userAgent("my-app/1.0")
 *     .build();
 */
export class RockskyClientBuilder {
  private readonly opts: ClientOptions = {};

  baseUrl(url: string): this {
    this.opts.baseUrl = url;
    return this;
  }

  auth(auth: AuthProvider): this {
    this.opts.auth = auth;
    return this;
  }

  bearer(token: string): this {
    this.opts.auth = token;
    return this;
  }

  fetch(impl: FetchLike): this {
    this.opts.fetch = impl;
    return this;
  }

  header(key: string, value: string): this {
    this.opts.headers = { ...this.opts.headers, [key]: value };
    return this;
  }

  headers(headers: Record<string, string>): this {
    this.opts.headers = { ...this.opts.headers, ...headers };
    return this;
  }

  userAgent(ua: string): this {
    this.opts.userAgent = ua;
    return this;
  }

  timeout(ms: number): this {
    this.opts.timeoutMs = ms;
    return this;
  }

  retries(n: number): this {
    this.opts.retries = n;
    return this;
  }

  retryDelay(ms: number): this {
    this.opts.retryDelayMs = ms;
    return this;
  }

  build(): RockskyClient {
    return new RockskyClient(this.opts);
  }
}

/** Convenience factory — equivalent to `new RockskyClient(options)`. */
export function createClient(options: ClientOptions = {}): RockskyClient {
  return new RockskyClient(options);
}
