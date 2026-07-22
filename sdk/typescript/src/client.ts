import { Client, simpleFetchHandler } from "@atcute/client";

import { RockskyError } from "./errors.js";
import type {
  ActorProfileViewDetailed,
  AlbumViewBasic,
  ArtistViewBasic,
  FeedSearchResultsView,
  GetActorAlbumsOutput,
  GetActorArtistsOutput,
  GetActorScrobblesOutput,
  GetActorSongsOutput,
  GetTopArtistsOutput,
  GetTopTracksOutput,
  ScrobbleViewBasic,
  SongViewBasic,
  StatsGlobalStatsView,
} from "./generated/types.js";

/** The default public Rocksky AppView base URL. */
export const DEFAULT_APPVIEW = "https://api.rocksky.app";

/** Unauthenticated read client over the public Rocksky AppView XRPC. */
export class RockskyClient {
  private rpc: Client;

  /** Build a read client against an AppView base URL (defaults to {@link DEFAULT_APPVIEW}). */
  constructor(appview: string = DEFAULT_APPVIEW) {
    this.rpc = new Client({ handler: simpleFetchHandler({ service: appview }) });
  }

  private async query<T>(nsid: string, params: Record<string, unknown>): Promise<T> {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") clean[k] = v;
    }
    const res = await this.rpc.get(nsid as never, { params: clean } as never);
    if (!res.ok) throw new RockskyError(res.data);
    return res.data as T;
  }

  /** An actor's detailed profile. `actor` is a handle or DID. */
  profile(actor: string): Promise<ActorProfileViewDetailed> {
    return this.query("app.rocksky.actor.getProfile", { did: actor });
  }

  /** An actor's scrobbles, newest first. */
  async scrobbles(actor: string, limit = 50, offset = 0): Promise<ScrobbleViewBasic[]> {
    const out = await this.query<GetActorScrobblesOutput>("app.rocksky.actor.getActorScrobbles", {
      did: actor,
      limit,
      offset,
    });
    return out.scrobbles ?? [];
  }

  /** An actor's most-played songs. */
  async songs(actor: string, limit = 50, offset = 0): Promise<SongViewBasic[]> {
    const out = await this.query<GetActorSongsOutput>("app.rocksky.actor.getActorSongs", {
      did: actor,
      limit,
      offset,
    });
    return out.songs ?? [];
  }

  /** An actor's most-played albums. */
  async albums(actor: string, limit = 50, offset = 0): Promise<AlbumViewBasic[]> {
    const out = await this.query<GetActorAlbumsOutput>("app.rocksky.actor.getActorAlbums", {
      did: actor,
      limit,
      offset,
    });
    return out.albums ?? [];
  }

  /** An actor's most-played artists. */
  async artists(actor: string, limit = 50, offset = 0): Promise<ArtistViewBasic[]> {
    const out = await this.query<GetActorArtistsOutput>("app.rocksky.actor.getActorArtists", {
      did: actor,
      limit,
      offset,
    });
    return out.artists ?? [];
  }

  /** The platform-wide top tracks chart. */
  async topTracks(limit = 50, offset = 0): Promise<SongViewBasic[]> {
    const out = await this.query<GetTopTracksOutput>("app.rocksky.charts.getTopTracks", { limit, offset });
    return out.tracks ?? [];
  }

  /** The platform-wide top artists chart. */
  async topArtists(limit = 50, offset = 0): Promise<ArtistViewBasic[]> {
    const out = await this.query<GetTopArtistsOutput>("app.rocksky.charts.getTopArtists", { limit, offset });
    return out.artists ?? [];
  }

  /** Full-text search across songs, albums, artists, playlists, actors. */
  search(query: string): Promise<FeedSearchResultsView> {
    return this.query("app.rocksky.feed.search", { query });
  }

  /** Platform-wide totals. */
  globalStats(): Promise<StatsGlobalStatsView> {
    return this.query("app.rocksky.stats.getGlobalStats", {});
  }
}
