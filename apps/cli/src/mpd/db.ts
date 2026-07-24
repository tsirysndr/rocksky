// The "database" an MPD client browses. Rocksky has no on-disk music library —
// it's a remote streaming service — so we expose a *virtual* one backed by the
// uploads API and the Navidrome-compatible playlist API. Songs are addressed by
// a stable URI so ids round-trip through `add`.

import { RockskyClient } from "client";
import {
  entryToItem,
  getCreds,
  getPlaylist,
  getPlaylists,
  getStarred,
  type NavidromeCreds,
} from "../tui/navidrome";
import type { QueueItem } from "../tui/player";
import { kv } from "./protocol";

// URI scheme. `rocksky:upload:<uploadId>` streams through the uploads endpoint;
// `rocksky:track:<trackId>` streams a playlist/favorite track through Navidrome.
export const UPLOAD_PREFIX = "rocksky:upload:";
export const TRACK_PREFIX = "rocksky:track:";

export function itemUri(item: QueueItem): string {
  if (item.uploadId) return `${UPLOAD_PREFIX}${item.uploadId}`;
  if (item.trackId) return `${TRACK_PREFIX}${item.trackId}`;
  return "";
}

/** A raw uploads-API record → a QueueItem (mirrors the TUI's `toTrack`). */
function uploadToItem(r: any): QueueItem {
  return {
    uploadId: r.upload?.id ?? "",
    title: r.track?.title ?? "Unknown",
    artist: r.track?.artist ?? "",
    album: r.track?.album,
    albumArtist: r.track?.albumArtist,
    albumArt: r.track?.albumArt,
    duration: r.track?.duration, // milliseconds
    mimeType: r.upload?.mimeType,
    uri: r.track?.uri,
    trackId: r.track?.id,
  };
}

const asMs = (item: QueueItem) => item.duration ?? 0;
const asSec = (item: QueueItem) => Math.round(asMs(item) / 1000);

/**
 * Emit a song as MPD `key: value` lines. `pos`/`id` are only included for queue
 * listings (playlistinfo), where MPD needs a position and a stable song id.
 */
export function songLines(
  item: QueueItem,
  pos?: number,
  id?: number,
): string[] {
  const lines = [kv("file", itemUri(item))];
  lines.push(kv("Title", item.title || "Unknown"));
  if (item.artist) lines.push(kv("Artist", item.artist));
  if (item.album) lines.push(kv("Album", item.album));
  if (item.albumArtist) lines.push(kv("AlbumArtist", item.albumArtist));
  const sec = asSec(item);
  if (sec > 0) {
    lines.push(kv("Time", sec));
    lines.push(kv("duration", (asMs(item) / 1000).toFixed(3)));
  }
  if (pos != null) lines.push(kv("Pos", pos));
  if (id != null) lines.push(kv("Id", id));
  return lines;
}

/** A filter parsed from `find`/`search`/`list` args: `[tag, value]` pairs. */
export type Filter = { tag: string; value: string }[];

/**
 * Backs every browse command. Holds a token-scoped RockskyClient plus a
 * uri → QueueItem cache populated as the client browses, so a later `add <uri>`
 * resolves full metadata without another round-trip.
 */
export class MpdDb {
  private metaCache = new Map<string, QueueItem>();
  private credsPromise: Promise<NavidromeCreds | null> | null = null;

  constructor(private readonly getToken: () => string | undefined) {}

  private client(): RockskyClient {
    return new RockskyClient(this.getToken());
  }

  private creds(): Promise<NavidromeCreds | null> {
    if (!this.credsPromise) {
      this.credsPromise = getCreds(this.getToken()).catch(() => null);
    }
    return this.credsPromise;
  }

  private remember(item: QueueItem): QueueItem {
    const uri = itemUri(item);
    if (uri) this.metaCache.set(uri, item);
    return item;
  }

  /** Resolve a browse URI to a playable QueueItem (cached metadata if known). */
  resolveUri(uri: string): QueueItem | null {
    const cached = this.metaCache.get(uri);
    if (cached) return cached;
    // Not browsed this session — still playable from the id alone, just without
    // rich tags until it starts.
    if (uri.startsWith(UPLOAD_PREFIX)) {
      return { uploadId: uri.slice(UPLOAD_PREFIX.length), title: uri, artist: "" };
    }
    if (uri.startsWith(TRACK_PREFIX)) {
      return {
        uploadId: "",
        trackId: uri.slice(TRACK_PREFIX.length),
        title: uri,
        artist: "",
      };
    }
    return null;
  }

  // --- list ----------------------------------------------------------------
  // `list artist` / `list album [artist "X"]` — the Media Library screen.
  async listArtists(): Promise<string[]> {
    const rows = (await this.client().getUploadArtists({ limit: 500 })) || [];
    return rows.map((r: any) => r.name).filter(Boolean);
  }

  async listAlbums(artist?: string): Promise<string[]> {
    const rows = (await this.client().getUploadAlbums({ limit: 500 })) || [];
    return rows
      .filter((r: any) => !artist || r.albumArtist === artist)
      .map((r: any) => r.album)
      .filter(Boolean);
  }

  // --- find / search -------------------------------------------------------
  // Return songs matching a filter. `exact` distinguishes `find` (exact match)
  // from `search` (case-insensitive substring). We push what the uploads API
  // can filter server-side (album drill-down, free-text q) and refine the rest
  // in memory.
  async findSongs(filter: Filter, exact: boolean): Promise<QueueItem[]> {
    const get = (tag: string) =>
      filter.find((f) => f.tag.toLowerCase() === tag)?.value;
    const artist = get("artist") || get("albumartist");
    const album = get("album");
    const any = get("any") || get("title") || get("file");

    let rows: any[];
    if (album) {
      rows =
        (await this.client().getUploads({
          limit: 500,
          albumArtist: artist,
          albumName: album,
        })) || [];
    } else if (any && exact === false) {
      rows = (await this.client().getUploads({ limit: 200, q: any })) || [];
    } else {
      rows = (await this.client().getUploads({ limit: 200, q: any })) || [];
    }

    let items = rows.map((r) => this.remember(uploadToItem(r)));

    // Refine against every filter term the API couldn't apply precisely.
    const match = (hay: string | undefined, needle: string) => {
      const h = (hay || "").toLowerCase();
      const n = needle.toLowerCase();
      return exact ? (hay || "") === needle : h.includes(n);
    };
    for (const { tag, value } of filter) {
      const t = tag.toLowerCase();
      if (t === "any") {
        items = items.filter(
          (i) =>
            match(i.title, value) ||
            match(i.artist, value) ||
            match(i.album, value),
        );
      } else if (t === "artist" || t === "albumartist") {
        items = items.filter(
          (i) => match(i.artist, value) || match(i.albumArtist, value),
        );
      } else if (t === "album") {
        items = items.filter((i) => match(i.album, value));
      } else if (t === "title") {
        items = items.filter((i) => match(i.title, value));
      }
    }
    return items;
  }

  /** Every track of an album (used by `add`-ing an album directory). */
  async albumTracks(artist: string, album: string): Promise<QueueItem[]> {
    const rows =
      (await this.client().getUploads({
        limit: 500,
        albumArtist: artist,
        albumName: album,
      })) || [];
    return rows.map((r) => this.remember(uploadToItem(r)));
  }

  // --- stored playlists ----------------------------------------------------
  async playlistNames(): Promise<string[]> {
    const creds = await this.creds();
    if (!creds) return [];
    const lists = await getPlaylists(creds).catch(() => []);
    return lists.map((p) => p.name);
  }

  async playlistTracks(name: string): Promise<QueueItem[]> {
    const creds = await this.creds();
    if (!creds) return [];
    // Favorites is a synthetic list mapped to Navidrome's starred songs.
    if (name.toLowerCase() === "favorites" || name.toLowerCase() === "loved") {
      const songs = await getStarred(creds).catch(() => []);
      return songs.map((s) => this.remember(entryToItem(s)));
    }
    const lists = await getPlaylists(creds).catch(() => []);
    const match = lists.find((p) => p.name === name);
    if (!match) return [];
    const { entries } = await getPlaylist(creds, match.id);
    return entries.map((e) => this.remember(entryToItem(e)));
  }
}
