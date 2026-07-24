// The "database" an MPD client browses. Rocksky has no on-disk music library —
// it's a remote streaming service — so we expose a *virtual* one backed by the
// uploads API and the Navidrome-compatible playlist API. Songs are addressed by
// a stable URI so ids round-trip through `add`.
//
// The whole library is preloaded once into an in-memory index (artist ->
// albums -> tracks) and served from there, so browse/filter is instant and
// correct regardless of how a client phrases its query. The index is persisted
// to a classic-level (LevelDB) store so a restart warms up from disk instead of
// re-fetching, then refreshes in the background.

import { RockskyClient } from "client";
import os from "os";
import path from "path";
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
  // Album date lives on the record, not the track: prefer the year, else the
  // year part of the ISO release date. Never emit a bogus/empty date.
  const date =
    r.albumYear != null
      ? String(r.albumYear)
      : typeof r.albumReleaseDate === "string"
        ? r.albumReleaseDate.slice(0, 4)
        : undefined;
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
    trackNumber: r.track?.trackNumber ?? undefined,
    discNumber: r.track?.discNumber ?? undefined,
    albumUri: r.track?.albumUri ?? r.albumUri ?? undefined,
    genre: r.track?.genre ?? undefined,
    date,
  };
}

// Order tracks the way an album should read: by disc, then track number.
function sortTracks(items: QueueItem[]): QueueItem[] {
  return items.slice().sort((a, b) => {
    const disc = (a.discNumber ?? 1) - (b.discNumber ?? 1);
    if (disc !== 0) return disc;
    return (a.trackNumber ?? 0) - (b.trackNumber ?? 0);
  });
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
  if (item.trackNumber != null) lines.push(kv("Track", item.trackNumber));
  if (item.discNumber != null) lines.push(kv("Disc", item.discNumber));
  // Only emit Date when we actually have one — an empty/zero Date is what
  // clients render as an "invalid" year.
  if (item.date) lines.push(kv("Date", item.date));
  if (item.genre) lines.push(kv("Genre", item.genre));
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

/** A distinct album with its stable at:// URI (its real identity). */
export interface AlbumInfo {
  album: string;
  albumArtist: string;
  albumUri: string;
}

// The preloaded, in-memory view of the whole library.
interface LibIndex {
  tracks: QueueItem[];
  byAlbumUri: Map<string, QueueItem[]>; // album key -> its tracks, sorted
  albums: AlbumInfo[];
  artists: string[];
  albumArtists: string[];
}

const EMPTY_INDEX: LibIndex = {
  tracks: [],
  byAlbumUri: new Map(),
  albums: [],
  artists: [],
  albumArtists: [],
};

// A cheap content signature for the library, to detect whether a background
// re-fetch actually changed anything (count + a rolling hash of track ids).
function librarySignature(tracks: QueueItem[]): string {
  let h = 0;
  for (const t of tracks) {
    const id = t.uploadId || t.trackId || "";
    for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  }
  return `${tracks.length}:${h}`;
}

// Group a flat track list into the artist/album/track index.
function buildIndex(tracks: QueueItem[]): LibIndex {
  const byAlbumUri = new Map<string, QueueItem[]>();
  const albumsMap = new Map<string, AlbumInfo>();
  const artists = new Set<string>();
  const albumArtists = new Set<string>();
  for (const t of tracks) {
    if (t.artist) artists.add(t.artist);
    if (t.albumArtist) albumArtists.add(t.albumArtist);
    // Group by the stable albumUri; fall back to artist+album for the rare
    // track with no albumUri (uses \u0000 so it can't collide with real text).
    const key = t.albumUri || `${t.albumArtist ?? ""}\u0000${t.album ?? ""}`;
    let bucket = byAlbumUri.get(key);
    if (!bucket) byAlbumUri.set(key, (bucket = []));
    bucket.push(t);
    if (t.album && !albumsMap.has(key)) {
      albumsMap.set(key, {
        album: t.album,
        albumArtist: t.albumArtist ?? "",
        albumUri: t.albumUri ?? key,
      });
    }
  }
  for (const [k, v] of byAlbumUri) byAlbumUri.set(k, sortTracks(v));
  const byName = (a: string, b: string) => a.localeCompare(b);
  return {
    tracks,
    byAlbumUri,
    albums: [...albumsMap.values()].sort((a, b) => byName(a.album, b.album)),
    artists: [...artists].sort(byName),
    albumArtists: [...albumArtists].sort(byName),
  };
}

/**
 * Backs every browse command. Preloads the whole library into `idx` (persisted
 * via classic-level) and answers list/find/lsinfo from memory. Also keeps a
 * uri → QueueItem cache so a later `add <uri>` resolves full metadata.
 */
export class MpdDb {
  private metaCache = new Map<string, QueueItem>();
  private credsPromise: Promise<NavidromeCreds | null> | null = null;

  private idx: LibIndex = EMPTY_INDEX;
  private ready: Promise<void> | null = null;
  private level: any = null; // ClassicLevel; lazily opened so it never loads
  private levelUnavailable = false; // for non-mpd commands.
  private lastSig = ""; // library signature, to detect changes on re-sync.

  // Set by the server; invoked when a background sync detects the library
  // changed, so idle clients get a `database` change event.
  onLibraryChange: (() => void) | null = null;

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

  // The uploads API pages by offset/size and caps the page at its own maximum
  // (~200) even when we ask for more — so we can NOT stop on `length < PAGE`
  // (that truncated the library to the first page). Advance by the *actual*
  // number of rows returned and stop only on an empty page.
  private static readonly PAGE = 500;
  private static readonly MAX_ROWS = 100_000;

  private async pageAll(
    fetchPage: (skip: number, size: number) => Promise<any[]>,
  ): Promise<any[]> {
    const out: any[] = [];
    let skip = 0;
    while (out.length < MpdDb.MAX_ROWS) {
      const page = (await fetchPage(skip, MpdDb.PAGE)) || [];
      if (page.length === 0) break;
      out.push(...page);
      skip += page.length;
    }
    return out;
  }

  // --- persistent cache (classic-level) ------------------------------------
  private levelPath(): string {
    return path.join(os.homedir(), ".rocksky", "mpd-cache");
  }

  private async openLevel(): Promise<any | null> {
    if (this.level) return this.level;
    if (this.levelUnavailable) return null;
    try {
      const { ClassicLevel } = await import("classic-level");
      const db = new ClassicLevel(this.levelPath(), { valueEncoding: "json" });
      await db.open();
      this.level = db;
      return db;
    } catch {
      // Another instance holds the lock, or the native module is missing —
      // fall back to a memory-only cache (still fully functional, just no warm
      // start across restarts).
      this.levelUnavailable = true;
      return null;
    }
  }

  /** Load the persisted track list (empty if none / unavailable). */
  private async loadPersisted(): Promise<QueueItem[]> {
    const level = await this.openLevel();
    if (!level) return [];
    const out: QueueItem[] = [];
    try {
      for await (const [key, val] of level.iterator()) {
        if (typeof key === "string" && key.startsWith("t:")) out.push(val);
      }
    } catch {
      // ignore read errors — treat as empty cache
    }
    return out;
  }

  private async persist(tracks: QueueItem[]): Promise<void> {
    const level = await this.openLevel();
    if (!level) return;
    try {
      await level.clear();
      const batch = level.batch();
      for (const t of tracks) {
        const id = t.uploadId || t.trackId;
        if (id) batch.put(`t:${id}`, t);
      }
      batch.put("meta", { count: tracks.length });
      await batch.write();
    } catch {
      // best-effort cache write
    }
  }

  // --- preload / index -----------------------------------------------------
  /** Kick off the preload without waiting (called at server startup). */
  preload(): void {
    void this.index();
  }

  private index(): Promise<LibIndex> {
    if (!this.ready) this.ready = this.warm();
    return this.ready.then(() => this.idx);
  }

  private async warm(): Promise<void> {
    // 1. Warm start from the persistent cache — instant, no network.
    const cached = await this.loadPersisted();
    if (cached.length) {
      this.idx = buildIndex(cached);
      this.lastSig = librarySignature(cached);
      cached.forEach((t) => this.remember(t));
    }
    // 2. First run (empty cache): fetch now so the first browse has data.
    //    Otherwise refresh in the background so browsing stays instant.
    if (this.idx.tracks.length === 0) {
      await this.sync();
    } else {
      void this.sync();
    }
  }

  /**
   * Re-fetch the whole library from the API and update the in-memory index +
   * persistent cache. Called at startup and periodically by the server to keep
   * the cache in sync with the API in the background. When the library actually
   * changed, fires `onLibraryChange` so idle clients refresh.
   */
  async sync(): Promise<void> {
    const token = this.getToken();
    if (!token) return;
    let rows: any[];
    try {
      rows = await this.pageAll((skip, size) =>
        this.client().getUploads({ skip, limit: size }),
      );
    } catch {
      return; // keep whatever we already have
    }
    if (!rows.length) return;
    const tracks = rows.map((r) => uploadToItem(r));
    const sig = librarySignature(tracks);
    if (sig === this.lastSig && this.idx.tracks.length) return; // unchanged
    this.lastSig = sig;
    this.idx = buildIndex(tracks);
    tracks.forEach((t) => this.remember(t));
    void this.persist(tracks);
    this.onLibraryChange?.();
  }

  /** Drop the index + persistent cache; next browse re-fetches (MPD update). */
  async refresh(): Promise<void> {
    this.idx = EMPTY_INDEX;
    this.ready = null;
    this.lastSig = "";
    const level = await this.openLevel();
    if (level) await level.clear().catch(() => {});
  }

  // --- cover art (for MPD albumart / readpicture) --------------------------
  // The uploads index already carries an albumArt CDN URL for every track, so
  // cover art needs no extra lookup; fall back to the SDK library's
  // getCoverArtUrl only when a track (e.g. a playlist entry) has none. Fetched
  // bytes are cached (a client requests one image across several offsets).
  private coverCache = new Map<string, { data: Buffer; mime: string }>();

  // Lazily import @rocksky/sdk so it's only loaded when actually needed (cover
  // art fallback / scan), never on a plain TUI launch.
  private async sdkLibrary(): Promise<any | null> {
    const token = this.getToken();
    if (!token) return null;
    try {
      const { RockskyClient: SdkClient } = await import("@rocksky/sdk");
      return new SdkClient(undefined, token).library();
    } catch {
      return null;
    }
  }

  async coverArt(uri: string): Promise<{ data: Buffer; mime: string } | null> {
    const cached = this.coverCache.get(uri);
    if (cached) return cached;

    const item = this.resolveUri(uri);
    let url = item?.albumArt;
    if (!url && item?.trackId) {
      try {
        const lib = await this.sdkLibrary();
        const res: any = await lib?.getCoverArtUrl(item.trackId);
        url = typeof res === "string" ? res : res?.url;
      } catch {
        // fall through — no art
      }
    }
    if (!url) return null;

    try {
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const mime = resp.headers.get("content-type") || "image/jpeg";
      const data = Buffer.from(await resp.arrayBuffer());
      const entry = { data, mime };
      if (this.coverCache.size > 8) this.coverCache.clear(); // tiny LRU
      this.coverCache.set(uri, entry);
      return entry;
    } catch {
      return null;
    }
  }

  /** Ask the Rocksky library to rescan storage (wired to MPD update/rescan). */
  async triggerScan(): Promise<void> {
    try {
      const lib = await this.sdkLibrary();
      await lib?.startScan();
    } catch {
      // best-effort; the periodic sync will pick up changes regardless
    }
  }

  /** Close the persistent store (called on server shutdown). */
  async close(): Promise<void> {
    if (this.level) {
      await this.level.close().catch(() => {});
      this.level = null;
    }
  }

  // --- resolve -------------------------------------------------------------
  /** Resolve a browse URI to a playable QueueItem (cached metadata if known). */
  resolveUri(uri: string): QueueItem | null {
    const cached = this.metaCache.get(uri);
    if (cached) return cached;
    // Not indexed yet — still playable from the id alone, just without rich
    // tags until it starts.
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

  // --- browse (all served from the in-memory index) ------------------------
  async listArtists(): Promise<string[]> {
    return (await this.index()).artists;
  }

  /** Distinct album artists — what MPD's "Album Artist" browse pane lists. */
  async albumArtists(): Promise<string[]> {
    return (await this.index()).albumArtists;
  }

  /** Distinct albums, optionally filtered to one album-artist. */
  async albums(artist?: string): Promise<AlbumInfo[]> {
    const idx = await this.index();
    return artist
      ? idx.albums.filter((a) => a.albumArtist === artist)
      : idx.albums;
  }

  async listAlbums(artist?: string): Promise<string[]> {
    return (await this.albums(artist)).map((a) => a.album);
  }

  /** Every track of an album, in disc/track order (resolved by album identity). */
  async albumTracks(album: string, artist?: string): Promise<QueueItem[]> {
    const idx = await this.index();
    const info =
      idx.albums.find(
        (a) => a.album === album && (!artist || a.albumArtist === artist),
      ) || idx.albums.find((a) => a.album === album);
    if (!info) return [];
    return idx.byAlbumUri.get(info.albumUri) || [];
  }

  /** All tracks (for listall/listallinfo). */
  async allSongs(): Promise<QueueItem[]> {
    return (await this.index()).tracks;
  }

  /**
   * Songs matching a filter, evaluated against the in-memory index. `exact`
   * distinguishes `find` (exact match) from `search` (case-insensitive
   * substring). Every tag is matched here, so any client query shape filters
   * correctly.
   */
  async findSongs(filter: Filter, exact: boolean): Promise<QueueItem[]> {
    const idx = await this.index();
    const match = (hay: string | undefined, needle: string) =>
      exact
        ? (hay || "") === needle
        : (hay || "").toLowerCase().includes(needle.toLowerCase());

    let items = idx.tracks;
    for (const { tag, value } of filter) {
      const t = tag.toLowerCase();
      if (t === "any") {
        items = items.filter(
          (i) =>
            match(i.title, value) ||
            match(i.artist, value) ||
            match(i.album, value) ||
            match(i.albumArtist, value),
        );
      } else if (t === "artist") {
        items = items.filter((i) => match(i.artist, value));
      } else if (t === "albumartist") {
        items = items.filter(
          (i) => match(i.albumArtist, value) || match(i.artist, value),
        );
      } else if (t === "album") {
        items = items.filter((i) => match(i.album, value));
      } else if (t === "title") {
        items = items.filter((i) => match(i.title, value));
      } else if (t === "genre") {
        items = items.filter((i) => match(i.genre, value));
      } else if (t === "date") {
        items = items.filter((i) => match(i.date, value));
      } else if (t === "file") {
        items = items.filter((i) => match(itemUri(i), value));
      }
    }
    // Group by album, then disc/track, so album results read in order.
    return items.slice().sort(
      (a, b) =>
        (a.albumArtist || "").localeCompare(b.albumArtist || "") ||
        (a.album || "").localeCompare(b.album || "") ||
        (a.discNumber ?? 1) - (b.discNumber ?? 1) ||
        (a.trackNumber ?? 0) - (b.trackNumber ?? 0),
    );
  }

  // --- stored playlists (small; fetched live) ------------------------------
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
