import { Client, simpleFetchHandler } from "@atcute/client";

import { RockskyError } from "./errors.js";
import type { Filter } from "./filter.js";
import { RockskyLibrary } from "./library.js";
import type {
  ActorProfileViewBasic,
  ActorProfileViewDetailed,
  AlbumViewBasic,
  AlbumViewDetailed,
  ArtistViewBasic,
  ArtistViewDetailed,
  ChartsDecadeViewBasic,
  ChartsScrobblerViewBasic,
  ChartsView,
  CreateScrobbleInput,
  FollowAccountOutput,
  FeedGeneratorsView,
  FeedRecommendationsView,
  FeedRecommendedAlbumsView,
  FeedRecommendedArtistsView,
  FeedSearchResultsView,
  FeedStoriesView,
  FeedView,
  GetActorAlbumsOutput,
  GetActorArtistsOutput,
  GetActorCompatibilityOutput,
  GetActorNeighboursOutput,
  GetActorPlaylistsOutput,
  GetActorScrobblesOutput,
  GetAlbumShoutsOutput,
  GetApikeysOutput,
  GetArtistListenersOutput,
  GetArtistRecentListenersOutput,
  GetArtistShoutsOutput,
  GetFeedGeneratorOutput,
  GetMirrorSourcesOutput,
  GetProfileShoutsOutput,
  GetShoutRepliesOutput,
  GetSongRecentListenersOutput,
  GetTrackShoutsOutput,
  GetUnreadCountOutput,
  ListNotificationsOutput,
  MirrorSourceView,
  PlayerCurrentlyPlayingViewDetailed,
  PlayerPlaybackQueueViewDetailed,
  PlaylistGetPlaylistsOutput,
  PlaylistViewDetailed,
  PutAudioSettingsInput,
  PutMirrorSourceInput,
  RockboxSettingsView,
  ScrobbleViewBasic,
  SongViewBasic,
  SongViewDetailed,
  StatsGlobalStatsView,
  StatsView,
  StatsWrappedView,
  PlaylistCreatePlaylistOutput,
  PlaylistUpdatePlaylistOutput,
  AddSongsOutput,
  UnfollowAccountOutput,
  UpdateSeenOutput,
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
  private token?: string;

  /**
   * Build a read client against an AppView base URL (defaults to
   * {@link DEFAULT_APPVIEW}). Pass `token` to send it as
   * `Authorization: Bearer <token>` on every read — needed only for auth-gated
   * queries and the whole {@link RockskyClient.library} surface.
   */
  constructor(appview: string = DEFAULT_APPVIEW, token?: string) {
    this.token = token;
    let handler = simpleFetchHandler({ service: appview });
    if (token) {
      const inner = handler;
      handler = ((pathname: string, init?: RequestInit) => {
        // `new Headers(init.headers)`, not a spread: atcute hands us a Headers
        // instance, and a Headers has no own enumerable properties — spreading
        // it yields `{}` and silently drops everything already set. That threw
        // away the `content-type: application/json` atcute adds for a JSON
        // body, so the AppView saw text/plain and rejected the request.
        const headers = new Headers(init?.headers);
        headers.set("authorization", `Bearer ${token}`);
        return inner(pathname, { ...init, headers });
      }) as typeof handler;
    }
    this.rpc = new Client({ handler });
  }

  /**
   * The authenticated `app.rocksky.library.*` (uploaded-music) API. Every
   * library method requires auth, so this throws unless the client was built
   * with a token.
   */
  library(): RockskyLibrary {
    if (!this.token) {
      throw new Error(
        "app.rocksky.library.* requires an access token; construct RockskyClient(appview, token) first",
      );
    }
    return new RockskyLibrary(this.rpc);
  }

  private async query<T>(nsid: string, params: Record<string, unknown>): Promise<T> {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") clean[k] = v;
    }
    const res = await this.rpc.get(nsid as never, { params: clean } as never);
    if (!res.ok) throw new RockskyError(res.data, res.status);
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

  /** Call any AppView procedure by nsid. `params` ride the query string (some
   * procedures take their arguments there), `body` is the JSON input — omitted
   * entirely when `undefined`. Escape hatch for procedures without a wrapper. */
  async post<T = unknown>(
    nsid: string,
    opts: { params?: Record<string, unknown>; body?: unknown } = {},
  ): Promise<T> {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(opts.params ?? {})) {
      if (v !== undefined && v !== "") clean[k] = v;
    }
    const call: Record<string, unknown> = { params: clean };
    if (opts.body !== undefined) call.input = opts.body;
    const res = await this.rpc.post(nsid as never, call as never);
    if (!res.ok) throw new RockskyError(res.data, res.status);
    return res.data as T;
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

  /** The top tracks chart over a typed {@link DateInterval}. Pass `did` to scope
   * it to one actor instead of the platform-wide ranking. */
  async topTracksInterval(
    limit: number,
    offset: number,
    interval: DateInterval,
    did?: string,
  ): Promise<SongViewBasic[]> {
    const out = await this.query<{ tracks?: SongViewBasic[] }>("app.rocksky.charts.getTopTracks", {
      limit,
      offset,
      did,
      ...interval,
    });
    return out.tracks ?? [];
  }

  /** The top artists chart over a typed {@link DateInterval}. Pass `did` to scope
   * it to one actor instead of the platform-wide ranking. */
  async topArtistsInterval(
    limit: number,
    offset: number,
    interval: DateInterval,
    did?: string,
  ): Promise<ArtistViewBasic[]> {
    const out = await this.query<{ artists?: ArtistViewBasic[] }>("app.rocksky.charts.getTopArtists", {
      limit,
      offset,
      did,
      ...interval,
    });
    return out.artists ?? [];
  }

  /** Scrobbles grouped by the release decade of the music, over a typed
   * {@link DateInterval}. Pass `did` to scope it to one actor. */
  async decades(
    interval: DateInterval = {},
    did?: string,
  ): Promise<ChartsDecadeViewBasic[]> {
    const out = await this.query<{ decades?: ChartsDecadeViewBasic[] }>(
      "app.rocksky.charts.getDecades",
      { did, ...interval },
    );
    return out.decades ?? [];
  }

  /** The listeners who scrobbled the most, over a typed {@link DateInterval}.
   * Pass `Interval.allTime()` for the all-time leaderboard. */
  async topScrobblers(
    limit = 20,
    offset = 0,
    interval: DateInterval = {},
  ): Promise<ChartsScrobblerViewBasic[]> {
    const out = await this.query<{ scrobblers?: ChartsScrobblerViewBasic[] }>(
      "app.rocksky.charts.getTopScrobblers",
      { limit, offset, ...interval },
    );
    return out.scrobblers ?? [];
  }

  /** The album catalog, optionally filtered by `genre` and/or an RSQL
   * {@link Filter} expression (see {@link AlbumFields}). */
  async catalogAlbums(
    limit = 50,
    offset = 0,
    genre?: string,
    filter?: string | Filter,
  ): Promise<AlbumViewBasic[]> {
    const out = await this.query<{ albums?: AlbumViewBasic[] }>("app.rocksky.album.getAlbums", {
      limit,
      offset,
      genre,
      filter: filter?.toString(),
    });
    return out.albums ?? [];
  }

  /** The artist catalog, optionally filtered by `genre` and/or an RSQL
   * {@link Filter} expression (see {@link ArtistFields}). */
  async catalogArtists(
    limit = 50,
    offset = 0,
    genre?: string,
    filter?: string | Filter,
  ): Promise<ArtistViewBasic[]> {
    const out = await this.query<{ artists?: ArtistViewBasic[] }>("app.rocksky.artist.getArtists", {
      limit,
      offset,
      genre,
      filter: filter?.toString(),
    });
    return out.artists ?? [];
  }

  /** The song catalog, optionally filtered by `genre` and/or an RSQL
   * {@link Filter} expression (see {@link SongFields}). */
  async catalogSongs(
    limit = 50,
    offset = 0,
    genre?: string,
    filter?: string | Filter,
  ): Promise<SongViewBasic[]> {
    const out = await this.query<{ tracks?: SongViewBasic[] }>("app.rocksky.song.getSongs", {
      limit,
      offset,
      genre,
      filter: filter?.toString(),
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
   * `following = true` for their follow graph. `filter` takes an RSQL
   * {@link Filter} expression (see {@link ScrobbleFields}). */
  async scrobbleFeed(
    did?: string,
    following = false,
    limit = 50,
    offset = 0,
    filter?: string | Filter,
  ): Promise<ScrobbleViewBasic[]> {
    const out = await this.query<{ scrobbles?: ScrobbleViewBasic[] }>("app.rocksky.scrobble.getScrobbles", {
      did,
      following,
      limit,
      offset,
      filter: filter?.toString(),
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

  // ---- detail reads (typed against the generated lexicon views) ----------

  /** A feed by its at:// URI (paginate via `cursor`). */
  feed(feed: string, limit = 50, cursor?: string): Promise<FeedView> {
    return this.query("app.rocksky.feed.getFeed", { feed, limit, cursor });
  }
  /** A single album with its tracklist. */
  album(uri: string): Promise<AlbumViewDetailed> {
    return this.query("app.rocksky.album.getAlbum", { uri });
  }
  /** A single artist with detail. */
  artist(uri: string): Promise<ArtistViewDetailed> {
    return this.query("app.rocksky.artist.getArtist", { uri });
  }
  /** Resolve full canonical metadata for a bare title + artist
   * (`app.rocksky.song.matchSong`); optionally anchor with `mbId` / `isrc`. */
  matchSong(title: string, artist: string, mbId?: string, isrc?: string): Promise<SongViewDetailed> {
    return this.query("app.rocksky.song.matchSong", { title, artist, mbId, isrc });
  }
  /** A single song by at:// `uri` (or by `mbid` / `isrc` / `spotifyId`). */
  song(opts: {
    uri?: string;
    mbid?: string;
    isrc?: string;
    spotifyId?: string;
  }): Promise<SongViewDetailed> {
    return this.query("app.rocksky.song.getSong", opts);
  }
  /** An actor's playlists. */
  actorPlaylists(actor: string, limit = 50, offset = 0): Promise<GetActorPlaylistsOutput> {
    return this.query("app.rocksky.actor.getActorPlaylists", { did: actor, limit, offset });
  }
  /** Actors with similar taste to `actor`. */
  neighbours(actor: string): Promise<GetActorNeighboursOutput> {
    return this.query("app.rocksky.actor.getActorNeighbours", { did: actor });
  }
  /** Music compatibility between the viewer and `actor` (auth). */
  compatibility(actor: string): Promise<GetActorCompatibilityOutput> {
    return this.query("app.rocksky.actor.getActorCompatibility", { did: actor });
  }
  /** An artist's all-time listeners. */
  artistListeners(uri: string, limit = 50, offset = 0): Promise<GetArtistListenersOutput> {
    return this.query("app.rocksky.artist.getArtistListeners", { uri, limit, offset });
  }
  /** An artist's recent listeners. */
  artistRecentListeners(
    uri: string,
    limit = 50,
    offset = 0,
  ): Promise<GetArtistRecentListenersOutput> {
    return this.query("app.rocksky.artist.getArtistRecentListeners", { uri, limit, offset });
  }
  /** A song's recent listeners. */
  songRecentListeners(uri: string, limit = 50, offset = 0): Promise<GetSongRecentListenersOutput> {
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
  }): Promise<ChartsView> {
    return this.query("app.rocksky.charts.getScrobblesChart", opts);
  }
  /** List the available feed generators. */
  feedGenerators(size?: number): Promise<FeedGeneratorsView> {
    return this.query("app.rocksky.feed.getFeedGenerators", { size });
  }
  /** A single feed generator's record. */
  feedGenerator(feed: string): Promise<GetFeedGeneratorOutput> {
    return this.query("app.rocksky.feed.getFeedGenerator", { feed });
  }
  /** The stories row. */
  stories(size?: number, feed?: string, following?: boolean): Promise<FeedStoriesView> {
    return this.query("app.rocksky.feed.getStories", { size, feed, following });
  }
  /** Track recommendations for `actor`. */
  recommendations(actor: string, limit?: number): Promise<FeedRecommendationsView> {
    return this.query("app.rocksky.feed.getRecommendations", { did: actor, limit });
  }
  /** Artist recommendations for `actor`. */
  artistRecommendations(actor: string, limit?: number): Promise<FeedRecommendedArtistsView> {
    return this.query("app.rocksky.feed.getArtistRecommendations", { did: actor, limit });
  }
  /** Album recommendations for `actor`. */
  albumRecommendations(actor: string, limit?: number): Promise<FeedRecommendedAlbumsView> {
    return this.query("app.rocksky.feed.getAlbumRecommendations", { did: actor, limit });
  }
  /** An actor's aggregate stats. */
  stats(actor: string): Promise<StatsView> {
    return this.query("app.rocksky.stats.getStats", { did: actor });
  }
  /** An actor's year-in-review. */
  wrapped(actor: string, year?: number): Promise<StatsWrappedView> {
    return this.query("app.rocksky.stats.getWrapped", { did: actor, year });
  }
  /** The viewer's configured scrobble mirror sources (auth). */
  mirrorSources(): Promise<GetMirrorSourcesOutput> {
    return this.query("app.rocksky.mirror.getMirrorSources", {});
  }
  /** What `actor` is playing now. */
  currentlyPlaying(playerId?: string, actor?: string): Promise<PlayerCurrentlyPlayingViewDetailed> {
    return this.query("app.rocksky.player.getCurrentlyPlaying", { playerId, actor });
  }
  /** A player's playback queue. */
  playbackQueue(playerId: string): Promise<PlayerPlaybackQueueViewDetailed> {
    return this.query("app.rocksky.player.getPlaybackQueue", { playerId });
  }
  /** What `actor` is playing now on Spotify. */
  spotifyCurrentlyPlaying(actor: string): Promise<PlayerCurrentlyPlayingViewDetailed> {
    return this.query("app.rocksky.spotify.getCurrentlyPlaying", { actor });
  }
  /** The playlist catalog, optionally filtered by an RSQL {@link Filter}
   * expression (see {@link PlaylistFields}). */
  playlists(
    limit = 50,
    offset = 0,
    filter?: string | Filter,
  ): Promise<PlaylistGetPlaylistsOutput> {
    return this.query("app.rocksky.playlist.getPlaylists", {
      limit,
      offset,
      filter: filter?.toString(),
    });
  }
  /** A single playlist with its items. */
  playlist(uri: string): Promise<PlaylistViewDetailed> {
    return this.query("app.rocksky.playlist.getPlaylist", { uri });
  }

  /**
   * Create a playlist (`app.rocksky.playlist.createPlaylist`). Auth required.
   * Publishes an app.rocksky.playlist record to the caller's repo; the AppView
   * only lists it once the commit has been ingested.
   */
  createPlaylist(input: {
    name: string;
    description?: string;
    pictureUrl?: string;
  }): Promise<PlaylistCreatePlaylistOutput> {
    return this.post("app.rocksky.playlist.createPlaylist", { params: input });
  }

  /** Rename or re-describe a playlist (`app.rocksky.playlist.updatePlaylist`). Owner only. */
  updatePlaylist(input: {
    uri: string;
    name?: string;
    description?: string;
    pictureUrl?: string;
  }): Promise<PlaylistUpdatePlaylistOutput> {
    return this.post("app.rocksky.playlist.updatePlaylist", { params: input });
  }

  /**
   * Add songs to a playlist (`app.rocksky.playlist.addSongs`). Owner only.
   * `songs` are app.rocksky.song AT-URIs; returns the created entry URIs.
   */
  addSongs(uri: string, songs: string[]): Promise<AddSongsOutput> {
    return this.post("app.rocksky.playlist.addSongs", {
      params: { uri, songs },
    });
  }

  /** Delete a playlist and the caller's own entries (`app.rocksky.playlist.removePlaylist`). Owner only. */
  removePlaylist(uri: string): Promise<void> {
    return this.post("app.rocksky.playlist.removePlaylist", { params: { uri } });
  }

  /**
   * Remove a song from a playlist (`app.rocksky.playlist.removeTrack`). An
   * entry can only be retracted by the repo that published it.
   */
  removeTrack(uri: string, songUri: string): Promise<void> {
    return this.post("app.rocksky.playlist.removeTrack", {
      params: { uri, songUri },
    });
  }
  /** Shouts on an album. */
  albumShouts(uri: string, limit = 50, offset = 0): Promise<GetAlbumShoutsOutput> {
    return this.query("app.rocksky.shout.getAlbumShouts", { uri, limit, offset });
  }
  /** Shouts on an artist. */
  artistShouts(uri: string, limit = 50, offset = 0): Promise<GetArtistShoutsOutput> {
    return this.query("app.rocksky.shout.getArtistShouts", { uri, limit, offset });
  }
  /** Shouts on a profile. */
  profileShouts(actor: string, limit = 50, offset = 0): Promise<GetProfileShoutsOutput> {
    return this.query("app.rocksky.shout.getProfileShouts", { did: actor, limit, offset });
  }
  /** Shouts on a track. */
  trackShouts(uri: string): Promise<GetTrackShoutsOutput> {
    return this.query("app.rocksky.shout.getTrackShouts", { uri });
  }
  /** Replies to a shout. */
  shoutReplies(uri: string, limit = 50, offset = 0): Promise<GetShoutRepliesOutput> {
    return this.query("app.rocksky.shout.getShoutReplies", { uri, limit, offset });
  }
  /** An actor's Rockbox EQ / audio settings. */
  audioSettings(actor: string): Promise<RockboxSettingsView> {
    return this.query("app.rocksky.rockbox.getAudioSettings", { did: actor });
  }
  /** The viewer's API keys (auth). */
  apikeys(limit = 50, offset = 0): Promise<GetApikeysOutput> {
    return this.query("app.rocksky.apikey.getApikeys", { limit, offset });
  }

  // ---- notifications (auth-gated — construct the client with a token) -----

  /** The authenticated viewer's unread-notification count. */
  unreadCount(): Promise<GetUnreadCountOutput> {
    return this.query("app.rocksky.notification.getUnreadCount", {});
  }
  /** The authenticated viewer's notifications, most recent first. `limit`
   * defaults to 30 server-side; paginate via `cursor`. */
  notifications(limit = 30, cursor?: string): Promise<ListNotificationsOutput> {
    return this.query("app.rocksky.notification.listNotifications", { limit, cursor });
  }
  /** Mark notifications as viewed. Pass the notification `ids` to mark, or omit
   * to mark **all** of the viewer's notifications. Returns the number remaining
   * unread. */
  async updateSeen(ids?: string[]): Promise<UpdateSeenOutput> {
    const res = await this.rpc.post("app.rocksky.notification.updateSeen" as never, {
      input: (ids && ids.length ? { ids } : {}) as never,
    } as never);
    if (!res.ok) throw new RockskyError(res.data, res.status);
    return res.data as UpdateSeenOutput;
  }

  /** Follow an account by DID or handle (`app.rocksky.graph.followAccount`). Auth required. */
  followAccount(account: string): Promise<FollowAccountOutput> {
    return this.post("app.rocksky.graph.followAccount", { params: { account } });
  }

  /** Unfollow an account by DID or handle (`app.rocksky.graph.unfollowAccount`). Auth required. */
  unfollowAccount(account: string): Promise<UnfollowAccountOutput> {
    return this.post("app.rocksky.graph.unfollowAccount", { params: { account } });
  }

  /** Submit a scrobble through the AppView (`app.rocksky.scrobble.createScrobble`).
   * Auth required. For direct-to-PDS scrobbling use {@link Agent} instead. */
  createScrobble(input: CreateScrobbleInput): Promise<ScrobbleViewBasic> {
    return this.post("app.rocksky.scrobble.createScrobble", { body: input });
  }

  /** Create or update a mirror source (`app.rocksky.mirror.putMirrorSource`). Auth required. */
  putMirrorSource(input: PutMirrorSourceInput): Promise<MirrorSourceView> {
    return this.post("app.rocksky.mirror.putMirrorSource", { body: input });
  }

  /** Patch the viewer's Rockbox audio settings (`app.rocksky.rockbox.putAudioSettings`).
   * Auth required. */
  putAudioSettings(input: PutAudioSettingsInput): Promise<RockboxSettingsView> {
    return this.post("app.rocksky.rockbox.putAudioSettings", { body: input });
  }
}
