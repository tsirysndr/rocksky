import { RockskyClient } from "../client.js";
import os from "os";
import path from "path";
import {
  entryToItem,
  getCreds,
  getPlaylist,
  getPlaylists,
  getStarred
} from "../tui/navidrome.js";
import { kv } from "./protocol.js";
const UPLOAD_PREFIX = "rocksky:upload:";
const TRACK_PREFIX = "rocksky:track:";
function itemUri(item) {
  if (item.uploadId) return `${UPLOAD_PREFIX}${item.uploadId}`;
  if (item.trackId) return `${TRACK_PREFIX}${item.trackId}`;
  return "";
}
function uploadToItem(r) {
  const date = r.albumYear != null ? String(r.albumYear) : typeof r.albumReleaseDate === "string" ? r.albumReleaseDate.slice(0, 4) : void 0;
  return {
    uploadId: r.upload?.id ?? "",
    title: r.track?.title ?? "Unknown",
    artist: r.track?.artist ?? "",
    album: r.track?.album,
    albumArtist: r.track?.albumArtist,
    albumArt: r.track?.albumArt,
    duration: r.track?.duration,
    // milliseconds
    mimeType: r.upload?.mimeType,
    uri: r.track?.uri,
    trackId: r.track?.id,
    trackNumber: r.track?.trackNumber ?? void 0,
    discNumber: r.track?.discNumber ?? void 0,
    albumUri: r.track?.albumUri ?? r.albumUri ?? void 0,
    genre: r.track?.genre ?? void 0,
    date
  };
}
function sortTracks(items) {
  return items.slice().sort((a, b) => {
    const disc = (a.discNumber ?? 1) - (b.discNumber ?? 1);
    if (disc !== 0) return disc;
    return (a.trackNumber ?? 0) - (b.trackNumber ?? 0);
  });
}
const asMs = (item) => item.duration ?? 0;
const asSec = (item) => Math.round(asMs(item) / 1e3);
function songLines(item, pos, id) {
  const lines = [kv("file", itemUri(item))];
  lines.push(kv("Title", item.title || "Unknown"));
  if (item.artist) lines.push(kv("Artist", item.artist));
  if (item.album) lines.push(kv("Album", item.album));
  if (item.albumArtist) lines.push(kv("AlbumArtist", item.albumArtist));
  if (item.trackNumber != null) lines.push(kv("Track", item.trackNumber));
  if (item.discNumber != null) lines.push(kv("Disc", item.discNumber));
  if (item.date) lines.push(kv("Date", item.date));
  if (item.genre) lines.push(kv("Genre", item.genre));
  const sec = asSec(item);
  if (sec > 0) {
    lines.push(kv("Time", sec));
    lines.push(kv("duration", (asMs(item) / 1e3).toFixed(3)));
  }
  if (pos != null) lines.push(kv("Pos", pos));
  if (id != null) lines.push(kv("Id", id));
  return lines;
}
const EMPTY_INDEX = {
  tracks: [],
  byAlbumUri: /* @__PURE__ */ new Map(),
  albums: [],
  artists: [],
  albumArtists: []
};
function librarySignature(tracks) {
  let h = 0;
  for (const t of tracks) {
    const id = t.uploadId || t.trackId || "";
    for (let i = 0; i < id.length; i++) h = Math.imul(h, 31) + id.charCodeAt(i) | 0;
  }
  return `${tracks.length}:${h}`;
}
function buildIndex(tracks) {
  const byAlbumUri = /* @__PURE__ */ new Map();
  const albumsMap = /* @__PURE__ */ new Map();
  const artists = /* @__PURE__ */ new Set();
  const albumArtists = /* @__PURE__ */ new Set();
  for (const t of tracks) {
    if (t.artist) artists.add(t.artist);
    if (t.albumArtist) albumArtists.add(t.albumArtist);
    const key = t.albumUri || `${t.albumArtist ?? ""}\0${t.album ?? ""}`;
    let bucket = byAlbumUri.get(key);
    if (!bucket) byAlbumUri.set(key, bucket = []);
    bucket.push(t);
    if (t.album && !albumsMap.has(key)) {
      albumsMap.set(key, {
        album: t.album,
        albumArtist: t.albumArtist ?? "",
        albumUri: t.albumUri ?? key
      });
    }
  }
  for (const [k, v] of byAlbumUri) byAlbumUri.set(k, sortTracks(v));
  const byName = (a, b) => a.localeCompare(b);
  return {
    tracks,
    byAlbumUri,
    albums: [...albumsMap.values()].sort((a, b) => byName(a.album, b.album)),
    artists: [...artists].sort(byName),
    albumArtists: [...albumArtists].sort(byName)
  };
}
class MpdDb {
  constructor(getToken) {
    this.getToken = getToken;
  }
  metaCache = /* @__PURE__ */ new Map();
  credsPromise = null;
  idx = EMPTY_INDEX;
  ready = null;
  level = null;
  // ClassicLevel; lazily opened so it never loads
  levelUnavailable = false;
  // for non-mpd commands.
  lastSig = "";
  // library signature, to detect changes on re-sync.
  // Set by the server; invoked when a background sync detects the library
  // changed, so idle clients get a `database` change event.
  onLibraryChange = null;
  client() {
    return new RockskyClient(this.getToken());
  }
  creds() {
    if (!this.credsPromise) {
      this.credsPromise = getCreds(this.getToken()).catch(() => null);
    }
    return this.credsPromise;
  }
  remember(item) {
    const uri = itemUri(item);
    if (uri) this.metaCache.set(uri, item);
    return item;
  }
  // The uploads API pages by offset/size and caps the page at its own maximum
  // (~200) even when we ask for more — so we can NOT stop on `length < PAGE`
  // (that truncated the library to the first page). Advance by the *actual*
  // number of rows returned and stop only on an empty page.
  static PAGE = 500;
  static MAX_ROWS = 1e5;
  async pageAll(fetchPage) {
    const out = [];
    let skip = 0;
    while (out.length < MpdDb.MAX_ROWS) {
      const page = await fetchPage(skip, MpdDb.PAGE) || [];
      if (page.length === 0) break;
      out.push(...page);
      skip += page.length;
    }
    return out;
  }
  // --- persistent cache (classic-level) ------------------------------------
  levelPath() {
    return path.join(os.homedir(), ".rocksky", "mpd-cache");
  }
  async openLevel() {
    if (this.level) return this.level;
    if (this.levelUnavailable) return null;
    try {
      const { ClassicLevel } = await import("classic-level");
      const db = new ClassicLevel(this.levelPath(), { valueEncoding: "json" });
      await db.open();
      this.level = db;
      return db;
    } catch {
      this.levelUnavailable = true;
      return null;
    }
  }
  /** Load the persisted track list (empty if none / unavailable). */
  async loadPersisted() {
    const level = await this.openLevel();
    if (!level) return [];
    const out = [];
    try {
      for await (const [key, val] of level.iterator()) {
        if (typeof key === "string" && key.startsWith("t:")) out.push(val);
      }
    } catch {
    }
    return out;
  }
  async persist(tracks) {
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
    }
  }
  // --- preload / index -----------------------------------------------------
  /** Kick off the preload without waiting (called at server startup). */
  preload() {
    void this.index();
  }
  index() {
    if (!this.ready) this.ready = this.warm();
    return this.ready.then(() => this.idx);
  }
  async warm() {
    const cached = await this.loadPersisted();
    if (cached.length) {
      this.idx = buildIndex(cached);
      this.lastSig = librarySignature(cached);
      cached.forEach((t) => this.remember(t));
    }
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
  async sync() {
    const token = this.getToken();
    if (!token) return;
    let rows;
    try {
      rows = await this.pageAll(
        (skip, size) => this.client().getUploads({ skip, limit: size })
      );
    } catch {
      return;
    }
    if (!rows.length) return;
    const tracks = rows.map((r) => uploadToItem(r));
    const sig = librarySignature(tracks);
    if (sig === this.lastSig && this.idx.tracks.length) return;
    this.lastSig = sig;
    this.idx = buildIndex(tracks);
    tracks.forEach((t) => this.remember(t));
    void this.persist(tracks);
    this.onLibraryChange?.();
  }
  /** Drop the index + persistent cache; next browse re-fetches (MPD update). */
  async refresh() {
    this.idx = EMPTY_INDEX;
    this.ready = null;
    this.lastSig = "";
    const level = await this.openLevel();
    if (level) await level.clear().catch(() => {
    });
  }
  // --- cover art (for MPD albumart / readpicture) --------------------------
  // The uploads index already carries an albumArt CDN URL for every track, so
  // cover art needs no extra lookup; fall back to the SDK library's
  // getCoverArtUrl only when a track (e.g. a playlist entry) has none. Fetched
  // bytes are cached (a client requests one image across several offsets).
  coverCache = /* @__PURE__ */ new Map();
  // Lazily import @rocksky/sdk so it's only loaded when actually needed (cover
  // art fallback / scan), never on a plain TUI launch.
  async sdkLibrary() {
    const token = this.getToken();
    if (!token) return null;
    try {
      const { RockskyClient: SdkClient } = await import("@rocksky/sdk");
      return new SdkClient(void 0, token).library();
    } catch {
      return null;
    }
  }
  async coverArt(uri) {
    const cached = this.coverCache.get(uri);
    if (cached) return cached;
    const item = this.resolveUri(uri);
    let url = item?.albumArt;
    if (!url && item?.trackId) {
      try {
        const lib = await this.sdkLibrary();
        const res = await lib?.getCoverArtUrl(item.trackId);
        url = typeof res === "string" ? res : res?.url;
      } catch {
      }
    }
    if (!url) return null;
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(15e3) });
      if (!resp.ok) return null;
      const mime = resp.headers.get("content-type") || "image/jpeg";
      const data = Buffer.from(await resp.arrayBuffer());
      const entry = { data, mime };
      if (this.coverCache.size > 8) this.coverCache.clear();
      this.coverCache.set(uri, entry);
      return entry;
    } catch {
      return null;
    }
  }
  /** Ask the Rocksky library to rescan storage (wired to MPD update/rescan). */
  async triggerScan() {
    try {
      const lib = await this.sdkLibrary();
      await lib?.startScan();
    } catch {
    }
  }
  /** Close the persistent store (called on server shutdown). */
  async close() {
    if (this.level) {
      await this.level.close().catch(() => {
      });
      this.level = null;
    }
  }
  // --- resolve -------------------------------------------------------------
  /** Resolve a browse URI to a playable QueueItem (cached metadata if known). */
  resolveUri(uri) {
    const cached = this.metaCache.get(uri);
    if (cached) return cached;
    if (uri.startsWith(UPLOAD_PREFIX)) {
      return { uploadId: uri.slice(UPLOAD_PREFIX.length), title: uri, artist: "" };
    }
    if (uri.startsWith(TRACK_PREFIX)) {
      return {
        uploadId: "",
        trackId: uri.slice(TRACK_PREFIX.length),
        title: uri,
        artist: ""
      };
    }
    return null;
  }
  // --- browse (all served from the in-memory index) ------------------------
  async listArtists() {
    return (await this.index()).artists;
  }
  /** Distinct album artists — what MPD's "Album Artist" browse pane lists. */
  async albumArtists() {
    return (await this.index()).albumArtists;
  }
  /** Distinct albums, optionally filtered to one album-artist. */
  async albums(artist) {
    const idx = await this.index();
    return artist ? idx.albums.filter((a) => a.albumArtist === artist) : idx.albums;
  }
  async listAlbums(artist) {
    return (await this.albums(artist)).map((a) => a.album);
  }
  /** Every track of an album, in disc/track order (resolved by album identity). */
  async albumTracks(album, artist) {
    const idx = await this.index();
    const info = idx.albums.find(
      (a) => a.album === album && (!artist || a.albumArtist === artist)
    ) || idx.albums.find((a) => a.album === album);
    if (!info) return [];
    return idx.byAlbumUri.get(info.albumUri) || [];
  }
  /** All tracks (for listall/listallinfo). */
  async allSongs() {
    return (await this.index()).tracks;
  }
  /**
   * Songs matching a filter, evaluated against the in-memory index. `exact`
   * distinguishes `find` (exact match) from `search` (case-insensitive
   * substring). Every tag is matched here, so any client query shape filters
   * correctly.
   */
  async findSongs(filter, exact) {
    const idx = await this.index();
    const match = (hay, needle) => exact ? (hay || "") === needle : (hay || "").toLowerCase().includes(needle.toLowerCase());
    let items = idx.tracks;
    for (const { tag, value } of filter) {
      const t = tag.toLowerCase();
      if (t === "any") {
        items = items.filter(
          (i) => match(i.title, value) || match(i.artist, value) || match(i.album, value) || match(i.albumArtist, value)
        );
      } else if (t === "artist") {
        items = items.filter((i) => match(i.artist, value));
      } else if (t === "albumartist") {
        items = items.filter(
          (i) => match(i.albumArtist, value) || match(i.artist, value)
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
    return items.slice().sort(
      (a, b) => (a.albumArtist || "").localeCompare(b.albumArtist || "") || (a.album || "").localeCompare(b.album || "") || (a.discNumber ?? 1) - (b.discNumber ?? 1) || (a.trackNumber ?? 0) - (b.trackNumber ?? 0)
    );
  }
  // --- stored playlists (small; fetched live) ------------------------------
  async playlistNames() {
    const creds = await this.creds();
    if (!creds) return [];
    const lists = await getPlaylists(creds).catch(() => []);
    return lists.map((p) => p.name);
  }
  async playlistTracks(name) {
    const creds = await this.creds();
    if (!creds) return [];
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
export {
  MpdDb,
  TRACK_PREFIX,
  UPLOAD_PREFIX,
  itemUri,
  songLines
};
