import type { Client } from "@atcute/client";

import { RockskyError } from "./errors.js";

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
    if (!res.ok) throw new RockskyError(res.data);
    return res.data as T;
  }

  private async procedure<T>(nsid: string, input: Record<string, unknown>): Promise<T> {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) {
      if (v !== undefined && v !== "") clean[k] = v;
    }
    const res = await this.rpc.post(nsid as never, { input: clean } as never);
    if (!res.ok) throw new RockskyError(res.data);
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
  getPlaylists(): Promise<unknown> {
    return this.query<unknown>("app.rocksky.library.getPlaylists", {});
  }

  /** `app.rocksky.library.getPlaylist` — requires auth. */
  getPlaylist(id: string): Promise<unknown> {
    return this.query<unknown>("app.rocksky.library.getPlaylist", { id });
  }

  /** `app.rocksky.library.createPlaylist` — requires auth. */
  createPlaylist(name: string): Promise<unknown> {
    return this.procedure<unknown>("app.rocksky.library.createPlaylist", { name });
  }

  /** `app.rocksky.library.updatePlaylist` — requires auth. */
  updatePlaylist(playlistId: string, opts: { name?: string; comment?: string; songIdToAdd?: string; songIndexToRemove?: number } = {}): Promise<unknown> {
    return this.procedure<unknown>("app.rocksky.library.updatePlaylist", { playlistId, ...opts });
  }

  /** `app.rocksky.library.deletePlaylist` — requires auth. */
  deletePlaylist(id: string): Promise<{ status: string; deleted: number }> {
    return this.procedure<{ status: string; deleted: number }>("app.rocksky.library.deletePlaylist", { id });
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
