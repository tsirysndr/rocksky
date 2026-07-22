import { Client, simpleFetchHandler } from "@atcute/client";

import { RockskyError } from "./errors.js";
import type {
  ActorProfileViewBasic,
  ActorProfileViewDetailed,
  AlbumViewBasic,
  ArtistViewBasic,
  FeedSearchResultsView,
  GetActorAlbumsOutput,
  GetActorArtistsOutput,
  GetActorScrobblesOutput,
  ScrobbleViewBasic,
  SongViewBasic,
  StatsGlobalStatsView,
} from "./generated/types.js";

/**
 * A typed date window for the `top*` charts. Build one with the {@link Interval}
 * factories; `range` bounds are RFC-3339 datetimes.
 */
export interface DateInterval {
  startDate?: string;
  endDate?: string;
}

function since(days = 0, months = 0, years = 0): DateInterval {
  const now = new Date();
  const start = new Date(now);
  start.setUTCFullYear(start.getUTCFullYear() - years);
  start.setUTCMonth(start.getUTCMonth() - months);
  start.setUTCDate(start.getUTCDate() - days);
  return { startDate: start.toISOString(), endDate: now.toISOString() };
}

/** Factories for {@link DateInterval} windows used by the `top*Interval` charts. */
export const Interval = {
  /** No bounds — the all-time chart. */
  allTime: (): DateInterval => ({}),
  /** The last `n` days ending now. */
  lastDays: (n: number): DateInterval => since(n),
  /** The last `n` weeks ending now. */
  lastWeeks: (n: number): DateInterval => since(7 * n),
  /** The last `n` months ending now. */
  lastMonths: (n: number): DateInterval => since(0, n),
  /** The last `n` years ending now. */
  lastYears: (n: number): DateInterval => since(0, 0, n),
  /** An explicit closed `[start, end]` window. */
  range: (start: Date, end: Date): DateInterval => ({
    startDate: start.toISOString(),
    endDate: end.toISOString(),
  }),
};

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

  /** Call any AppView read query by nsid; returns the raw JSON response. Every
   * method here is sugar over this — use it for queries without a wrapper. */
  get(nsid: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return this.query(nsid, params);
  }

  /** An actor's most-played songs. */
  async songs(actor: string, limit = 50, offset = 0): Promise<SongViewBasic[]> {
    const out = await this.query<{ tracks?: SongViewBasic[] }>("app.rocksky.actor.getActorSongs", {
      did: actor,
      limit,
      offset,
    });
    return out.tracks ?? [];
  }

  /** An actor's loved (liked) songs. */
  async lovedSongs(actor: string, limit = 50, offset = 0): Promise<SongViewBasic[]> {
    const out = await this.query<{ tracks?: SongViewBasic[] }>(
      "app.rocksky.actor.getActorLovedSongs",
      { did: actor, limit, offset },
    );
    return out.tracks ?? [];
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

  /** The platform-wide top tracks chart (all-time). */
  topTracks(limit = 50, offset = 0): Promise<SongViewBasic[]> {
    return this.topTracksInterval(limit, offset, Interval.allTime());
  }

  /** The platform-wide top artists chart (all-time). */
  topArtists(limit = 50, offset = 0): Promise<ArtistViewBasic[]> {
    return this.topArtistsInterval(limit, offset, Interval.allTime());
  }

  /** The top tracks chart over a typed {@link DateInterval}. */
  async topTracksInterval(limit: number, offset: number, interval: DateInterval): Promise<SongViewBasic[]> {
    const out = await this.query<{ tracks?: SongViewBasic[] }>("app.rocksky.charts.getTopTracks", {
      limit,
      offset,
      ...interval,
    });
    return out.tracks ?? [];
  }

  /** The top artists chart over a typed {@link DateInterval}. */
  async topArtistsInterval(limit: number, offset: number, interval: DateInterval): Promise<ArtistViewBasic[]> {
    const out = await this.query<{ artists?: ArtistViewBasic[] }>("app.rocksky.charts.getTopArtists", {
      limit,
      offset,
      ...interval,
    });
    return out.artists ?? [];
  }

  /** The album catalog, optionally filtered by `genre`. */
  async catalogAlbums(limit = 50, offset = 0, genre?: string): Promise<AlbumViewBasic[]> {
    const out = await this.query<{ albums?: AlbumViewBasic[] }>("app.rocksky.album.getAlbums", {
      limit,
      offset,
      genre,
    });
    return out.albums ?? [];
  }

  /** The artist catalog, optionally filtered by `genre`. */
  async catalogArtists(limit = 50, offset = 0, genre?: string): Promise<ArtistViewBasic[]> {
    const out = await this.query<{ artists?: ArtistViewBasic[] }>("app.rocksky.artist.getArtists", {
      limit,
      offset,
      genre,
    });
    return out.artists ?? [];
  }

  /** The song catalog, optionally filtered by `genre`. */
  async catalogSongs(limit = 50, offset = 0, genre?: string): Promise<SongViewBasic[]> {
    const out = await this.query<{ tracks?: SongViewBasic[] }>("app.rocksky.song.getSongs", {
      limit,
      offset,
      genre,
    });
    return out.tracks ?? [];
  }

  /** An album's tracklist by album at:// URI. */
  async albumTracks(uri: string): Promise<SongViewBasic[]> {
    const out = await this.query<{ tracks?: SongViewBasic[] }>("app.rocksky.album.getAlbumTracks", { uri });
    return out.tracks ?? [];
  }

  /** An artist's albums by artist at:// URI. */
  async artistAlbums(uri: string): Promise<AlbumViewBasic[]> {
    const out = await this.query<{ albums?: AlbumViewBasic[] }>("app.rocksky.artist.getArtistAlbums", { uri });
    return out.albums ?? [];
  }

  /** An artist's top tracks by artist at:// URI. */
  async artistTracks(uri: string, limit = 50, offset = 0): Promise<SongViewBasic[]> {
    const out = await this.query<{ tracks?: SongViewBasic[] }>("app.rocksky.artist.getArtistTracks", {
      uri,
      limit,
      offset,
    });
    return out.tracks ?? [];
  }

  /** A social/global scrobbles feed. Pass `did` to scope to an actor and
   * `following = true` for their follow graph. */
  async scrobbleFeed(did?: string, following = false, limit = 50, offset = 0): Promise<ScrobbleViewBasic[]> {
    const out = await this.query<{ scrobbles?: ScrobbleViewBasic[] }>("app.rocksky.scrobble.getScrobbles", {
      did,
      following,
      limit,
      offset,
    });
    return out.scrobbles ?? [];
  }

  /** A single scrobble by its at:// URI. */
  scrobble(uri: string): Promise<ScrobbleViewBasic> {
    return this.query("app.rocksky.scrobble.getScrobble", { uri });
  }

  /** The accounts `actor` follows. */
  async follows(actor: string, limit = 50, cursor?: string): Promise<ActorProfileViewBasic[]> {
    const out = await this.query<{ follows?: ActorProfileViewBasic[] }>("app.rocksky.graph.getFollows", {
      actor,
      limit,
      cursor,
    });
    return out.follows ?? [];
  }

  /** The accounts that follow `actor`. */
  async followers(actor: string, limit = 50, cursor?: string): Promise<ActorProfileViewBasic[]> {
    const out = await this.query<{ followers?: ActorProfileViewBasic[] }>("app.rocksky.graph.getFollowers", {
      actor,
      limit,
      cursor,
    });
    return out.followers ?? [];
  }

  /** Followers of `actor` that the viewer also follows. */
  async knownFollowers(actor: string, limit = 50, cursor?: string): Promise<ActorProfileViewBasic[]> {
    const out = await this.query<{ followers?: ActorProfileViewBasic[] }>(
      "app.rocksky.graph.getKnownFollowers",
      { actor, limit, cursor },
    );
    return out.followers ?? [];
  }

  /** Full-text search across songs, albums, artists, playlists, actors. */
  search(query: string): Promise<FeedSearchResultsView> {
    return this.query("app.rocksky.feed.search", { query });
  }

  /** Platform-wide totals. */
  globalStats(): Promise<StatsGlobalStatsView> {
    return this.query("app.rocksky.stats.getGlobalStats", {});
  }

  // ---- raw-JSON long tail: bespoke shapes returned as `unknown` ----------

  /** A feed by its at:// URI (paginate via `cursor`). */
  feed(feed: string, limit = 50, cursor?: string): Promise<unknown> {
    return this.query("app.rocksky.feed.getFeed", { feed, limit, cursor });
  }
  /** A single album with its tracklist. */
  album(uri: string): Promise<unknown> {
    return this.query("app.rocksky.album.getAlbum", { uri });
  }
  /** A single artist with detail. */
  artist(uri: string): Promise<unknown> {
    return this.query("app.rocksky.artist.getArtist", { uri });
  }
  /** A single song by at:// `uri` (or by `mbid` / `isrc` / `spotifyId`). */
  song(opts: { uri?: string; mbid?: string; isrc?: string; spotifyId?: string }): Promise<unknown> {
    return this.query("app.rocksky.song.getSong", opts);
  }
  /** An actor's playlists. */
  actorPlaylists(actor: string, limit = 50, offset = 0): Promise<unknown> {
    return this.query("app.rocksky.actor.getActorPlaylists", { did: actor, limit, offset });
  }
  /** Actors with similar taste to `actor`. */
  neighbours(actor: string): Promise<unknown> {
    return this.query("app.rocksky.actor.getActorNeighbours", { did: actor });
  }
  /** Music compatibility between the viewer and `actor` (auth). */
  compatibility(actor: string): Promise<unknown> {
    return this.query("app.rocksky.actor.getActorCompatibility", { did: actor });
  }
  /** An artist's all-time listeners. */
  artistListeners(uri: string, limit = 50, offset = 0): Promise<unknown> {
    return this.query("app.rocksky.artist.getArtistListeners", { uri, limit, offset });
  }
  /** An artist's recent listeners. */
  artistRecentListeners(uri: string, limit = 50, offset = 0): Promise<unknown> {
    return this.query("app.rocksky.artist.getArtistRecentListeners", { uri, limit, offset });
  }
  /** A song's recent listeners. */
  songRecentListeners(uri: string, limit = 50, offset = 0): Promise<unknown> {
    return this.query("app.rocksky.song.getSongRecentListeners", { uri, limit, offset });
  }
  /** A scrobble time-series chart. Scope with any of `did` / `artisturi` /
   * `albumuri` / `songuri` / `genre` and bound with `from` / `to`. */
  scrobblesChart(opts: {
    did?: string;
    artisturi?: string;
    albumuri?: string;
    songuri?: string;
    genre?: string;
    from?: string;
    to?: string;
  }): Promise<unknown> {
    return this.query("app.rocksky.charts.getScrobblesChart", opts);
  }
  /** List the available feed generators. */
  feedGenerators(size?: number): Promise<unknown> {
    return this.query("app.rocksky.feed.getFeedGenerators", { size });
  }
  /** A single feed generator's record. */
  feedGenerator(feed: string): Promise<unknown> {
    return this.query("app.rocksky.feed.getFeedGenerator", { feed });
  }
  /** The stories row. */
  stories(size?: number, feed?: string, following?: boolean): Promise<unknown> {
    return this.query("app.rocksky.feed.getStories", { size, feed, following });
  }
  /** Track recommendations for `actor`. */
  recommendations(actor: string, limit?: number): Promise<unknown> {
    return this.query("app.rocksky.feed.getRecommendations", { did: actor, limit });
  }
  /** Artist recommendations for `actor`. */
  artistRecommendations(actor: string, limit?: number): Promise<unknown> {
    return this.query("app.rocksky.feed.getArtistRecommendations", { did: actor, limit });
  }
  /** Album recommendations for `actor`. */
  albumRecommendations(actor: string, limit?: number): Promise<unknown> {
    return this.query("app.rocksky.feed.getAlbumRecommendations", { did: actor, limit });
  }
  /** An actor's aggregate stats. */
  stats(actor: string): Promise<unknown> {
    return this.query("app.rocksky.stats.getStats", { did: actor });
  }
  /** An actor's year-in-review. */
  wrapped(actor: string, year?: number): Promise<unknown> {
    return this.query("app.rocksky.stats.getWrapped", { did: actor, year });
  }
  /** The viewer's configured scrobble mirror sources (auth). */
  mirrorSources(): Promise<unknown> {
    return this.query("app.rocksky.mirror.getMirrorSources", {});
  }
  /** What `actor` is playing now. */
  currentlyPlaying(playerId?: string, actor?: string): Promise<unknown> {
    return this.query("app.rocksky.player.getCurrentlyPlaying", { playerId, actor });
  }
  /** A player's playback queue. */
  playbackQueue(playerId: string): Promise<unknown> {
    return this.query("app.rocksky.player.getPlaybackQueue", { playerId });
  }
  /** What `actor` is playing now on Spotify. */
  spotifyCurrentlyPlaying(actor: string): Promise<unknown> {
    return this.query("app.rocksky.spotify.getCurrentlyPlaying", { actor });
  }
  /** The playlist catalog. */
  playlists(limit = 50, offset = 0): Promise<unknown> {
    return this.query("app.rocksky.playlist.getPlaylists", { limit, offset });
  }
  /** A single playlist with its items. */
  playlist(uri: string): Promise<unknown> {
    return this.query("app.rocksky.playlist.getPlaylist", { uri });
  }
  /** Shouts on an album. */
  albumShouts(uri: string, limit = 50, offset = 0): Promise<unknown> {
    return this.query("app.rocksky.shout.getAlbumShouts", { uri, limit, offset });
  }
  /** Shouts on an artist. */
  artistShouts(uri: string, limit = 50, offset = 0): Promise<unknown> {
    return this.query("app.rocksky.shout.getArtistShouts", { uri, limit, offset });
  }
  /** Shouts on a profile. */
  profileShouts(actor: string, limit = 50, offset = 0): Promise<unknown> {
    return this.query("app.rocksky.shout.getProfileShouts", { did: actor, limit, offset });
  }
  /** Shouts on a track. */
  trackShouts(uri: string): Promise<unknown> {
    return this.query("app.rocksky.shout.getTrackShouts", { uri });
  }
  /** Replies to a shout. */
  shoutReplies(uri: string, limit = 50, offset = 0): Promise<unknown> {
    return this.query("app.rocksky.shout.getShoutReplies", { uri, limit, offset });
  }
  /** An actor's Rockbox EQ / audio settings. */
  audioSettings(actor: string): Promise<unknown> {
    return this.query("app.rocksky.rockbox.getAudioSettings", { did: actor });
  }
  /** The viewer's API keys (auth). */
  apikeys(limit = 50, offset = 0): Promise<unknown> {
    return this.query("app.rocksky.apikey.getApikeys", { limit, offset });
  }
}
