// MPD command handlers. Each maps a client command to the existing player
// singleton (playerController) and playback helpers, or to the virtual database
// (MpdDb). Handlers return the response *body* lines; the server appends `OK`.
// Throw MpdError to emit an `ACK`.

import {
  enqueueLast,
  jumpTo,
  resumeSession,
  skipNext,
  skipPrev,
} from "../tui/playback";
import { playerController, Repeat, type QueueItem } from "../tui/player";
import { bus } from "./bus";
import { itemUri, MpdDb, songLines, type Filter } from "./db";
import { Ack, kv, MpdError } from "./protocol";

export interface Ctx {
  getToken(): string | undefined;
  db: MpdDb;
}

export type Handler = (args: string[], ctx: Ctx) => Promise<string[]> | string[];

// --- transport / options helpers -------------------------------------------

// MPD models repeat as two flags (repeat + single); rockbox as one enum. Map
// between them: Off↔(0,0), All↔(repeat 1, single 0), One↔(repeat 1, single 1).
function repeatFlags(): { repeat: boolean; single: boolean } {
  const r = playerController.repeat();
  return { repeat: r !== Repeat.Off, single: r === Repeat.One };
}
function applyRepeatFlags(repeat: boolean, single: boolean) {
  playerController.setRepeat(
    !repeat ? Repeat.Off : single ? Repeat.One : Repeat.All,
  );
}

const boolArg = (v: string | undefined, current: boolean): boolean =>
  v === "1" ? true : v === "0" ? false : current;

// Parse a `START:END` or `POS` selector into a [start, end) half-open range,
// clamped to the queue length. A bare position selects a single item.
function parseRange(arg: string | undefined, len: number): [number, number] {
  if (arg == null) return [0, len];
  if (arg.includes(":")) {
    const [s, e] = arg.split(":");
    const start = Math.max(0, parseInt(s, 10) || 0);
    const end = e === "" || e == null ? len : Math.min(len, parseInt(e, 10));
    return [start, end];
  }
  const p = parseInt(arg, 10);
  if (Number.isNaN(p)) throw new MpdError(Ack.ARG, "Bad song index");
  return [p, p + 1];
}

// --- status ----------------------------------------------------------------

// The queue index MPD should treat as "current". While playing/paused it's the
// engine's index; when stopped with a session restored on startup it's the
// restored index — so a client that connects before the TUI hits play still
// shows the same current track, keeping the two in sync.
function currentIndex(st: ReturnType<typeof playerController.status>): number | null {
  if (st && st.index != null && st.state !== "stopped") return st.index;
  if (playerController.restored) return playerController.restored.index;
  return null;
}

const statusHandler: Handler = () => {
  const st = playerController.status();
  const { repeat, single } = repeatFlags();
  const state =
    !st || st.state === "stopped"
      ? "stop"
      : st.state === "playing"
        ? "play"
        : "pause";
  const lines = [
    kv("volume", Math.round(playerController.volume() * 100)),
    kv("repeat", repeat ? 1 : 0),
    kv("random", playerController.isShuffle() ? 1 : 0),
    kv("single", single ? 1 : 0),
    kv("consume", 0),
    kv("playlist", bus.counters.playlist),
    kv("playlistlength", playerController.queueItems.length),
    kv("state", state),
  ];
  const idx = currentIndex(st);
  if (idx != null && playerController.queueItems[idx]) {
    const item = playerController.queueItems[idx];
    lines.push(kv("song", idx));
    lines.push(kv("songid", idx));
    if (state !== "stop" && st) {
      // Live position/duration only while playing or paused.
      const durMs = st.duration_ms || item?.duration || 0;
      const posSec = (st.position_ms || 0) / 1000;
      lines.push(
        kv("time", `${Math.floor(posSec)}:${Math.round(durMs / 1000)}`),
      );
      lines.push(kv("elapsed", posSec.toFixed(3)));
      if (durMs > 0) lines.push(kv("duration", (durMs / 1000).toFixed(3)));
    }
  }
  return lines;
};

const currentSongHandler: Handler = () => {
  const st = playerController.status();
  const idx = currentIndex(st);
  if (idx == null) return [];
  const item = playerController.queueItems[idx];
  if (!item) return [];
  return songLines(item, idx, idx);
};

const statsHandler: Handler = () => [
  kv("artists", 0),
  kv("albums", 0),
  kv("songs", playerController.queueItems.length),
  kv("uptime", 0),
  kv("playtime", 0),
  kv("db_playtime", 0),
  kv("db_update", 0),
];

// --- transport -------------------------------------------------------------

const playHandler: Handler = async (args, ctx) => {
  const token = ctx.getToken();
  if (args[0] != null) {
    const pos = parseInt(args[0], 10);
    if (!Number.isNaN(pos) && token) await jumpTo(token, pos);
    return [];
  }
  // Bare `play`: resume a restored session if we're stopped, else unpause.
  const st = playerController.status();
  if (playerController.restored && (!st || st.state === "stopped")) {
    if (token) await resumeSession(token);
  } else {
    playerController.play();
  }
  return [];
};

const playIdHandler: Handler = async (args, ctx) => {
  // We report Id == Pos in queue listings, so playid maps straight to play.
  return playHandler(args, ctx);
};

const pauseHandler: Handler = (args) => {
  if (args[0] === "1") playerController.pause();
  else if (args[0] === "0") playerController.play();
  else playerController.toggle();
  return [];
};

const stopHandler: Handler = () => {
  // Keep the queue and position (unlike MPD's reset-to-start); just pause.
  playerController.pause();
  return [];
};

const nextHandler: Handler = async (_a, ctx) => {
  const token = ctx.getToken();
  if (token) await skipNext(token);
  else playerController.next();
  return [];
};

const prevHandler: Handler = async (_a, ctx) => {
  const token = ctx.getToken();
  if (token) await skipPrev(token);
  else playerController.previous();
  return [];
};

// Seek within the current track. `seekcur` accepts an absolute time or a
// relative `+N` / `-N` (seconds).
const seekCurHandler: Handler = (args) => {
  const raw = args[0];
  if (raw == null) throw new MpdError(Ack.ARG, "Missing time");
  const st = playerController.status();
  const curMs = st?.position_ms || 0;
  let ms: number;
  if (raw.startsWith("+") || raw.startsWith("-")) {
    ms = curMs + parseFloat(raw) * 1000;
  } else {
    ms = parseFloat(raw) * 1000;
  }
  playerController.seekMs(Math.max(0, ms));
  return [];
};

// `seek POS TIME` / `seekid ID TIME`: jump to the target then seek into it.
const seekHandler: Handler = async (args, ctx) => {
  const pos = parseInt(args[0], 10);
  const timeSec = parseFloat(args[1]);
  if (Number.isNaN(pos) || Number.isNaN(timeSec))
    throw new MpdError(Ack.ARG, "Bad arguments");
  const st = playerController.status();
  const token = ctx.getToken();
  if (st?.index !== pos && token) await jumpTo(token, pos);
  playerController.seekMs(Math.max(0, timeSec * 1000));
  return [];
};

// --- options ---------------------------------------------------------------

const setVolHandler: Handler = (args) => {
  const v = parseInt(args[0], 10);
  if (Number.isNaN(v)) throw new MpdError(Ack.ARG, "Bad volume");
  playerController.setVolume(Math.max(0, Math.min(100, v)) / 100);
  return [];
};

const getVolHandler: Handler = () => [
  kv("volume", Math.round(playerController.volume() * 100)),
];

const volumeHandler: Handler = (args) => {
  const delta = parseInt(args[0], 10);
  if (Number.isNaN(delta)) throw new MpdError(Ack.ARG, "Bad volume");
  playerController.nudgeVolume(delta / 100);
  return [];
};

const randomHandler: Handler = (args) => {
  const want = boolArg(args[0], playerController.isShuffle());
  if (playerController.isShuffle() !== want) playerController.toggleShuffle();
  return [];
};

const repeatHandler: Handler = (args) => {
  const { single } = repeatFlags();
  applyRepeatFlags(boolArg(args[0], repeatFlags().repeat), single);
  return [];
};

const singleHandler: Handler = (args) => {
  const { repeat } = repeatFlags();
  // MPD also accepts "oneshot"; treat it as single-on.
  const want = args[0] === "oneshot" ? true : boolArg(args[0], repeatFlags().single);
  applyRepeatFlags(repeat || want, want);
  return [];
};

// consume / crossfade / mixrampdb / replay_gain_mode: accept and ignore so
// clients that always set them don't error.
const noopOk: Handler = () => [];

// --- queue -----------------------------------------------------------------

function queueListing(start: number, end: number): string[] {
  const items = playerController.queueItems;
  const lines: string[] = [];
  for (let i = start; i < end && i < items.length; i++) {
    lines.push(...songLines(items[i], i, i));
  }
  return lines;
}

const playlistInfoHandler: Handler = (args) => {
  const [start, end] = parseRange(args[0], playerController.queueItems.length);
  return queueListing(start, end);
};

const playlistIdHandler: Handler = (args) => {
  if (args[0] == null) return queueListing(0, playerController.queueItems.length);
  const id = parseInt(args[0], 10);
  return queueListing(id, id + 1);
};

// We don't track granular playlist versions, so report the whole queue as
// "changed" — clients re-render from it, which is always correct.
const plChangesHandler: Handler = () =>
  queueListing(0, playerController.queueItems.length);

async function resolveAddUri(uri: string, ctx: Ctx): Promise<QueueItem[]> {
  const item = ctx.db.resolveUri(uri);
  if (item) return [item];
  throw new MpdError(Ack.NO_EXIST, `Not found: ${uri}`);
}

const addHandler: Handler = async (args, ctx) => {
  const token = ctx.getToken();
  if (!token) throw new MpdError(Ack.PERMISSION, "Not logged in");
  const items = await resolveAddUri(args[0], ctx);
  await enqueueLast(token, items);
  return [];
};

const addIdHandler: Handler = async (args, ctx) => {
  const token = ctx.getToken();
  if (!token) throw new MpdError(Ack.PERMISSION, "Not logged in");
  const items = await resolveAddUri(args[0], ctx);
  await enqueueLast(token, items);
  // Id == final position of the appended track.
  const id = playerController.queueItems.length - 1;
  return [kv("Id", id)];
};

const deleteHandler: Handler = (args) => {
  const [start, end] = parseRange(args[0], playerController.queueItems.length);
  // Remove back-to-front so indices stay valid.
  for (let i = end - 1; i >= start; i--) playerController.removeAt(i);
  return [];
};

const deleteIdHandler: Handler = (args) => {
  const id = parseInt(args[0], 10);
  if (Number.isNaN(id)) throw new MpdError(Ack.ARG, "Bad song id");
  playerController.removeAt(id);
  return [];
};

const clearHandler: Handler = () => {
  playerController.close();
  bus.bump("playlist");
  return [];
};

const addUriToQueue = enqueueLast; // alias for readability below

// --- database: list / find / search / lsinfo -------------------------------

// Parse `TYPE value TYPE value …` filter pairs (find/search/count). Also accept
// the legacy `list album "artist"` positional form.
function parseFilter(args: string[]): Filter {
  const filter: Filter = [];
  for (let i = 0; i + 1 < args.length; i += 2) {
    filter.push({ tag: args[i], value: args[i + 1] });
  }
  return filter;
}

const listHandler: Handler = async (args, ctx) => {
  const type = (args[0] || "").toLowerCase();
  if (type === "artist" || type === "albumartist") {
    const artists = await ctx.db.listArtists();
    return artists.map((a) => kv("Artist", a));
  }
  if (type === "album") {
    // `list album artist "X"` or legacy `list album "X"`.
    let artist: string | undefined;
    if (args[1] && args[1].toLowerCase() === "artist") artist = args[2];
    else if (args[1]) artist = args[1];
    const albums = await ctx.db.listAlbums(artist);
    return albums.map((a) => kv("Album", a));
  }
  return [];
};

async function findLike(args: string[], ctx: Ctx, exact: boolean) {
  // args are TYPE value pairs (e.g. `find artist "X" album "Y"`).
  const items = await ctx.db.findSongs(parseFilter(args), exact);
  return items.flatMap((i) => songLines(i));
}

const findHandler: Handler = (args, ctx) => findLike(args, ctx, true);
const searchHandler: Handler = (args, ctx) => findLike(args, ctx, false);

// `findadd` / `searchadd`: like find/search but append the results to the queue.
async function findAdd(args: string[], ctx: Ctx, exact: boolean) {
  const token = ctx.getToken();
  if (!token) throw new MpdError(Ack.PERMISSION, "Not logged in");
  const items = await ctx.db.findSongs(parseFilter(args), exact);
  if (items.length) await addUriToQueue(token, items);
  return [];
}
const findAddHandler: Handler = (args, ctx) => findAdd(args, ctx, true);
const searchAddHandler: Handler = (args, ctx) => findAdd(args, ctx, false);

const countHandler: Handler = async (args, ctx) => {
  const items = await ctx.db.findSongs(parseFilter(args), true);
  const playtime = items.reduce(
    (s, i) => s + Math.round((i.duration || 0) / 1000),
    0,
  );
  return [kv("songs", items.length), kv("playtime", playtime)];
};

// lsinfo: a shallow filesystem view. Root lists top categories + stored
// playlists; `Artists` lists artists; `Artists/<name>` lists albums;
// `Artists/<name>/<album>` lists that album's songs.
const lsInfoHandler: Handler = async (args, ctx) => {
  const uri = (args[0] || "").replace(/^\/+|\/+$/g, "");
  if (!uri) {
    const lines = [
      kv("directory", "Artists"),
      kv("directory", "Albums"),
      kv("directory", "Playlists"),
    ];
    for (const name of await ctx.db.playlistNames()) {
      lines.push(kv("playlist", name));
    }
    return lines;
  }
  const parts = uri.split("/");
  if (parts[0] === "Artists") {
    if (parts.length === 1) {
      return (await ctx.db.listArtists()).map((a) =>
        kv("directory", `Artists/${a}`),
      );
    }
    if (parts.length === 2) {
      return (await ctx.db.listAlbums(parts[1])).map((al) =>
        kv("directory", `Artists/${parts[1]}/${al}`),
      );
    }
    if (parts.length === 3) {
      // Artists/<artist>/<album> — resolve within the artist to disambiguate.
      const items = await ctx.db.albumTracks(parts[2], parts[1]);
      return items.flatMap((i) => songLines(i));
    }
  }
  if (parts[0] === "Albums") {
    if (parts.length === 1) {
      return (await ctx.db.albums()).map((a) =>
        kv("directory", `Albums/${a.album}`),
      );
    }
    if (parts.length === 2) {
      const items = await ctx.db.albumTracks(parts[1]);
      return items.flatMap((i) => songLines(i));
    }
  }
  if (parts[0] === "Playlists" && parts.length === 1) {
    return (await ctx.db.playlistNames()).map((n) => kv("playlist", n));
  }
  return [];
};

// listall/listallinfo: reuse the shallow lsinfo view for the given path rather
// than recursively enumerating the whole remote library (which would be slow
// and huge). Enough for clients that drill down interactively.
const listAllInfoHandler: Handler = (args, ctx) => lsInfoHandler(args, ctx);

// --- stored playlists ------------------------------------------------------

const listPlaylistsHandler: Handler = async (_a, ctx) => {
  const names = await ctx.db.playlistNames();
  return names.map((n) => kv("playlist", n));
};

const listPlaylistInfoHandler: Handler = async (args, ctx) => {
  if (!args[0]) throw new MpdError(Ack.ARG, "Missing playlist name");
  const items = await ctx.db.playlistTracks(args[0]);
  return items.flatMap((i) => songLines(i));
};

const listPlaylistHandler: Handler = async (args, ctx) => {
  if (!args[0]) throw new MpdError(Ack.ARG, "Missing playlist name");
  const items = await ctx.db.playlistTracks(args[0]);
  return items.map((i) => kv("file", itemUri(i)));
};

const loadHandler: Handler = async (args, ctx) => {
  const token = ctx.getToken();
  if (!token) throw new MpdError(Ack.PERMISSION, "Not logged in");
  if (!args[0]) throw new MpdError(Ack.ARG, "Missing playlist name");
  const items = await ctx.db.playlistTracks(args[0]);
  if (items.length) await enqueueLast(token, items);
  return [];
};

// Replace the queue with a playlist and start playing it.
const playPlaylistHandler = loadHandler;

// --- reflection / misc -----------------------------------------------------

const outputsHandler: Handler = () => [
  kv("outputid", 0),
  kv("outputname", "Rocksky"),
  kv("outputenabled", 1),
];

const tagTypesHandler: Handler = (args) => {
  // `tagtypes clear|all|enable|disable …` are configuration subcommands that
  // reply with a bare OK; only the argless form lists the available tags.
  if (args.length) return [];
  return ["Artist", "Album", "AlbumArtist", "Title", "Track"].map((t) =>
    kv("tagtype", t),
  );
};

// Cover art. We don't serve binaries over the protocol, so report "no file" —
// the standard MPD response when a song has no embedded/adjacent art. Clients
// (rmpc, ncmpcpp) fall back to no cover rather than failing.
const albumArtHandler: Handler = () => {
  throw new MpdError(Ack.NO_EXIST, "No file exists");
};

const replayGainStatusHandler: Handler = () => [kv("replay_gain_mode", "off")];

// Announced command set. Kept in sync with `handlers` below.
export let commandNames: string[] = [];
const commandsHandler: Handler = () => commandNames.map((c) => kv("command", c));

export const handlers: Record<string, Handler> = {
  // status
  status: statusHandler,
  currentsong: currentSongHandler,
  stats: statsHandler,
  // transport
  play: playHandler,
  playid: playIdHandler,
  pause: pauseHandler,
  stop: stopHandler,
  next: nextHandler,
  previous: prevHandler,
  seek: seekHandler,
  seekid: seekHandler,
  seekcur: seekCurHandler,
  // options
  setvol: setVolHandler,
  getvol: getVolHandler,
  volume: volumeHandler,
  random: randomHandler,
  repeat: repeatHandler,
  single: singleHandler,
  consume: noopOk,
  crossfade: noopOk,
  mixrampdb: noopOk,
  mixrampdelay: noopOk,
  replay_gain_mode: noopOk,
  replay_gain_status: replayGainStatusHandler,
  // queue
  playlistinfo: playlistInfoHandler,
  playlistid: playlistIdHandler,
  plchanges: plChangesHandler,
  plchangesposid: plChangesHandler,
  add: addHandler,
  addid: addIdHandler,
  delete: deleteHandler,
  deleteid: deleteIdHandler,
  clear: clearHandler,
  // move/shuffle within the queue aren't supported by the rockbox engine
  // (no reorder primitive without re-resolving stream URLs); accept as no-ops.
  move: noopOk,
  moveid: noopOk,
  shuffle: noopOk,
  swap: noopOk,
  swapid: noopOk,
  // database
  list: listHandler,
  find: findHandler,
  search: searchHandler,
  findadd: findAddHandler,
  searchadd: searchAddHandler,
  count: countHandler,
  lsinfo: lsInfoHandler,
  listall: listAllInfoHandler,
  listallinfo: listAllInfoHandler,
  // Drop the memoized artist/album lists so the next browse re-pages the
  // library, then report a (dummy) update job id as MPD does.
  update: (_a, ctx) => {
    ctx.db.refresh();
    bus.bump("database");
    return [kv("updating_db", 1)];
  },
  rescan: (_a, ctx) => {
    ctx.db.refresh();
    bus.bump("database");
    return [kv("updating_db", 1)];
  },
  // stored playlists
  listplaylists: listPlaylistsHandler,
  listplaylist: listPlaylistHandler,
  listplaylistinfo: listPlaylistInfoHandler,
  load: loadHandler,
  playplaylist: playPlaylistHandler,
  // reflection / misc
  outputs: outputsHandler,
  tagtypes: tagTypesHandler,
  commands: commandsHandler,
  notcommands: () => [],
  urlhandlers: () => [kv("handler", "rocksky:")],
  decoders: () => [],
  config: () => [],
  password: noopOk,
  ping: noopOk,
  // Modern clients (rmpc, MALP) negotiate a binary-chunk size on connect and
  // request cover art. Accept the negotiation; report no art.
  binarylimit: noopOk,
  albumart: albumArtHandler,
  readpicture: albumArtHandler,
  // Client-to-client channels: acknowledge so clients that probe them don't
  // error (we have no channel bus, so reads are empty).
  channels: () => [],
  readmessages: () => [],
  subscribe: noopOk,
  unsubscribe: noopOk,
  sendmessage: noopOk,
};

commandNames = Object.keys(handlers).concat(["idle", "noidle", "close", "kill"]).sort();
