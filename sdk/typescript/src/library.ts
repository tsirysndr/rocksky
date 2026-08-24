import type { Client } from "@atcute/client";

import { RockskyError } from "./errors.js";

/** A song in the library, in the Subsonic `Child` shape. */
export interface LibrarySong {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumArtist?: string;
  /** Seconds, not milliseconds — Subsonic's unit. */
  duration: number;
  coverArt?: string;
  albumId?: string;
  artistId?: string;
  track?: number;
  discNumber?: number;
  genre?: string;
  suffix?: string;
  contentType?: string;
  size?: number;
  musicBrainzId?: string;
  samplingRate?: number;
}

/**
 * A library playlist. Subsonic's `Playlist` shape plus two Rocksky extensions:
 * `uri` and `trackArts`.
 */
export interface LibraryPlaylist {
  id: string;
  name: string;
  songCount: number;
  /** Seconds. */
  duration: number;
  created: string;
  changed: string;
  public: boolean;
  comment?: string;
  coverArt?: string;
  /**
   * AT-URI of the `app.rocksky.playlist` record this playlist is mirrored to.
   * Absent while the record has yet to be published.
   */
  uri?: string;
  /**
   * Album art of up to four of the playlist's tracks, oldest first — enough
   * for a cover mosaic. Absent when none of them have art.
   */
  trackArts?: string[];
  /** Only present on `getPlaylist`. */
  entry?: LibrarySong[];
}

/** Envelope every navidrome method replies with. */
interface SubsonicResponse {
  status: string;
  version?: string;
  type?: string;
}

/**
 * Reply to a playlist mutation.
 *
 * The playlist is mirrored to the caller's PDS as an `app.rocksky.playlist`
 * record. That mirror runs after the library has already been updated, so it
 * can't fail the call: when it does fail, the library change still stands and
 * the reason lands in `atprotoError` for the caller to surface.
 */
export interface LibraryPlaylistMutation extends SubsonicResponse {
  /** The resulting playlist — `createPlaylist` only. */
  playlist?: LibraryPlaylist;
  /** AT-URI of the mirrored record, when one was published or already existed. */
  uri?: string;
  atprotoError?: string;
}

export interface LibraryPlaylistsResponse extends SubsonicResponse {
  playlists: { playlist: LibraryPlaylist[] };
}

export interface LibraryPlaylistResponse extends SubsonicResponse {
  playlist: LibraryPlaylist;
}

/**
 * Authenticated client for the `app.rocksky.library.*` API — the Subsonic /
 * navidrome-compatible surface over a user's uploaded music.
 *
 * Every method requires auth, so this is only reachable via
 * {@link RockskyClient.library}, which throws unless the client was built with
 * a token. Outputs are the AppView's raw JSON payloads (the library lexicons
 * are intentionally loose).
 */
export class RockskyLibrary {
  constructor(private readonly rpc: Client) {}

  private async query<T>(nsid: string, params: Record<string, unknown>): Promise<T> {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") clean[k] = v;
    }
    const res = await this.rpc.get(nsid as never, { params: clean } as never);
    if (!res.ok) throw new RockskyError(res.data, res.status);
    return res.data as T;
  }

  private async procedure<T>(nsid: string, input: Record<string, unknown>): Promise<T> {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) {
      if (v !== undefined && v !== "") clean[k] = v;
    }
    const res = await this.rpc.post(nsid as never, { input: clean } as never);
    if (!res.ok) throw new RockskyError(res.data, res.status);
    return res.data as T;
  }

  /** `app.rocksky.library.ping` — requires auth. */
  ping(): Promise<unknown> {
    return this.query<unknown>("app.rocksky.library.ping", {});
  }

  /** `app.rocksky.library.getLicense` — requires auth. */
  getLicense(): Promise<unknown> {
    return this.query<unknown>("app.rocksky.library.getLicense", {});
  }

  /** `app.rocksky.library.getMusicFolders` — requires auth. */
  getMusicFolders(): Promise<unknown> {
    return this.query<unknown>("app.rocksky.library.getMusicFolders", {});
  }

  /** `app.rocksky.library.getScanStatus` — requires auth. */
  getScanStatus(): Promise<unknown> {
    return this.query<unknown>("app.rocksky.library.getScanStatus", {});
  }

  /** `app.rocksky.library.startScan` — requires auth. */
  startScan(): Promise<unknown> {
    return this.query<unknown>("app.rocksky.library.startScan", {});
  }

  /** `app.rocksky.library.getUser` — requires auth. */
  getUser(): Promise<unknown> {
    return this.query<unknown>("app.rocksky.library.getUser", {});
  }

  /** `app.rocksky.library.getArtists` — requires auth. */
  getArtists(): Promise<unknown> {
    return this.query<unknown>("app.rocksky.library.getArtists", {});
  }

  /** `app.rocksky.library.getIndexes` — requires auth. */
  getIndexes(): Promise<unknown> {
    return this.query<unknown>("app.rocksky.library.getIndexes", {});
  }

  /** `app.rocksky.library.getArtist` — requires auth. */
  getArtist(id: string): Promise<unknown> {
    return this.query<unknown>("app.rocksky.library.getArtist", { id });
  }

  /** `app.rocksky.library.getArtistInfo` — requires auth. */
  getArtistInfo(id: string): Promise<unknown> {
    return this.query<unknown>("app.rocksky.library.getArtistInfo", { id });
  }

  /** `app.rocksky.library.getAlbum` — requires auth. */
  getAlbum(id: string): Promise<unknown> {
    return this.query<unknown>("app.rocksky.library.getAlbum", { id });
  }

  /** `app.rocksky.library.getAlbumList` — requires auth. */
  getAlbumList(type: string, opts: { size?: number; offset?: number; fromYear?: number; toYear?: number; genre?: string } = {}): Promise<unknown> {
    return this.query<unknown>("app.rocksky.library.getAlbumList", { type, ...opts });
  }

  /** `app.rocksky.library.getAlbumInfo` — requires auth. */
  getAlbumInfo(id: string): Promise<unknown> {
    return this.query<unknown>("app.rocksky.library.getAlbumInfo", { id });
  }

  /** `app.rocksky.library.getSong` — requires auth. */
  getSong(id: string): Promise<unknown> {
    return this.query<unknown>("app.rocksky.library.getSong", { id });
  }

  /** `app.rocksky.library.getRandomSongs` — requires auth. */
  getRandomSongs(opts: { size?: number; genre?: string; fromYear?: number; toYear?: number } = {}): Promise<unknown> {
    return this.query<unknown>("app.rocksky.library.getRandomSongs", { ...opts });
  }

  /** `app.rocksky.library.getSongsByGenre` — requires auth. */
  getSongsByGenre(genre: string, opts: { count?: number; offset?: number } = {}): Promise<unknown> {
    return this.query<unknown>("app.rocksky.library.getSongsByGenre", { genre, ...opts });
  }

  /** `app.rocksky.library.getSimilarSongs` — requires auth. */
  getSimilarSongs(id: string, opts: { count?: number } = {}): Promise<unknown> {
    return this.query<unknown>("app.rocksky.library.getSimilarSongs", { id, ...opts });
  }

  /** `app.rocksky.library.getTopSongs` — requires auth. */
  getTopSongs(artist: string, opts: { count?: number } = {}): Promise<unknown> {
    return this.query<unknown>("app.rocksky.library.getTopSongs", { artist, ...opts });
  }

  /** `app.rocksky.library.getLyrics` — requires auth. */
  getLyrics(opts: { artist?: string; title?: string } = {}): Promise<unknown> {
    return this.query<unknown>("app.rocksky.library.getLyrics", { ...opts });
  }

  /** `app.rocksky.library.getMusicDirectory` — requires auth. */
  getMusicDirectory(id: string): Promise<unknown> {
    return this.query<unknown>("app.rocksky.library.getMusicDirectory", { id });
  }

  /** `app.rocksky.library.getGenres` — requires auth. */
  getGenres(): Promise<unknown> {
    return this.query<unknown>("app.rocksky.library.getGenres", {});
  }

  /** `app.rocksky.library.search` — requires auth. */
  search(query: string, opts: { artistCount?: number; artistOffset?: number; albumCount?: number; albumOffset?: number; songCount?: number; songOffset?: number } = {}): Promise<unknown> {
    return this.query<unknown>("app.rocksky.library.search", { query, ...opts });
  }

  /** `app.rocksky.library.getStarred` — requires auth. */
  getStarred(): Promise<unknown> {
    return this.query<unknown>("app.rocksky.library.getStarred", {});
  }

  /** `app.rocksky.library.star` — requires auth. */
  star(id: string, opts: { albumId?: string; artistId?: string } = {}): Promise<unknown> {
    return this.procedure<unknown>("app.rocksky.library.star", { id, ...opts });
  }

  /** `app.rocksky.library.unstar` — requires auth. */
  unstar(id: string, opts: { albumId?: string; artistId?: string } = {}): Promise<unknown> {
    return this.procedure<unknown>("app.rocksky.library.unstar", { id, ...opts });
  }

  /** `app.rocksky.library.getPlaylists` — requires auth. */
  getPlaylists(): Promise<LibraryPlaylistsResponse> {
    return this.query<LibraryPlaylistsResponse>("app.rocksky.library.getPlaylists", {});
  }

  /** `app.rocksky.library.getPlaylist` — requires auth. */
  getPlaylist(id: string): Promise<LibraryPlaylistResponse> {
    return this.query<LibraryPlaylistResponse>("app.rocksky.library.getPlaylist", { id });
  }

  /**
   * `app.rocksky.library.createPlaylist` — requires auth.
   *
   * Also publishes an `app.rocksky.playlist` record to the caller's PDS; see
   * {@link LibraryPlaylistMutation} for how a failure there is reported.
   */
  createPlaylist(name: string): Promise<LibraryPlaylistMutation> {
    return this.procedure<LibraryPlaylistMutation>("app.rocksky.library.createPlaylist", { name });
  }

  /**
   * `app.rocksky.library.updatePlaylist` — requires auth.
   *
   * Renames, adds a song or removes the song at a position, and replays the
   * same change onto the mirrored record.
   */
  updatePlaylist(playlistId: string, opts: { name?: string; comment?: string; songIdToAdd?: string; songIndexToRemove?: number } = {}): Promise<LibraryPlaylistMutation> {
    return this.procedure<LibraryPlaylistMutation>("app.rocksky.library.updatePlaylist", { playlistId, ...opts });
  }

  /**
   * `app.rocksky.library.deletePlaylist` — requires auth.
   *
   * Retracts the mirrored record and the caller's entries in it too.
   */
  deletePlaylist(id: string): Promise<LibraryPlaylistMutation> {
    return this.procedure<LibraryPlaylistMutation>("app.rocksky.library.deletePlaylist", { id });
  }

  /** `app.rocksky.library.deleteSong` — requires auth. */
  deleteSong(id: string): Promise<{ status: string; deleted: number }> {
    return this.procedure<{ status: string; deleted: number }>("app.rocksky.library.deleteSong", { id });
  }

  /** `app.rocksky.library.deleteAlbum` — requires auth. */
  deleteAlbum(id: string): Promise<{ status: string; deleted: number }> {
    return this.procedure<{ status: string; deleted: number }>("app.rocksky.library.deleteAlbum", { id });
  }

  /** `app.rocksky.library.scrobble` — requires auth. */
  scrobble(id: string, opts: { time?: number; submission?: boolean } = {}): Promise<unknown> {
    return this.procedure<unknown>("app.rocksky.library.scrobble", { id, ...opts });
  }

  /** `app.rocksky.library.updateNowPlaying` — requires auth. */
  updateNowPlaying(id: string): Promise<unknown> {
    return this.procedure<unknown>("app.rocksky.library.updateNowPlaying", { id });
  }

  /** `app.rocksky.library.getNowPlaying` — requires auth. */
  getNowPlaying(): Promise<unknown> {
    return this.query<unknown>("app.rocksky.library.getNowPlaying", {});
  }

  /** `app.rocksky.library.getPlayQueue` — requires auth. */
  getPlayQueue(): Promise<unknown> {
    return this.query<unknown>("app.rocksky.library.getPlayQueue", {});
  }

  /** `app.rocksky.library.savePlayQueue` — requires auth. */
  savePlayQueue(opts: { id?: string; current?: string; position?: number } = {}): Promise<unknown> {
    return this.procedure<unknown>("app.rocksky.library.savePlayQueue", { ...opts });
  }

  /** `app.rocksky.library.getStreamUrl` — requires auth. */
  getStreamUrl(id: string, opts: { maxBitRate?: number; format?: string } = {}): Promise<{ url: string }> {
    return this.query<{ url: string }>("app.rocksky.library.getStreamUrl", { id, ...opts });
  }

  /** `app.rocksky.library.getDownloadUrl` — requires auth. */
  getDownloadUrl(id: string): Promise<{ url: string }> {
    return this.query<{ url: string }>("app.rocksky.library.getDownloadUrl", { id });
  }

  /** `app.rocksky.library.getCoverArtUrl` — requires auth. */
  getCoverArtUrl(id: string, opts: { size?: number } = {}): Promise<{ url: string }> {
    return this.query<{ url: string }>("app.rocksky.library.getCoverArtUrl", { id, ...opts });
  }

  /** `app.rocksky.library.getInternetRadioStations` — requires auth. */
  getInternetRadioStations(): Promise<unknown> {
    return this.query<unknown>("app.rocksky.library.getInternetRadioStations", {});
  }
}
