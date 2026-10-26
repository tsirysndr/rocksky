import * as Commands from "../../../output/Rocksky.Cli.Mpd.Commands/index.js";
import { enqueueLast, resumeSession, streamAndPlay } from "../tui/playback.js";
import { playerController, Repeat } from "../tui/player.js";
import { bus } from "./bus.js";
import { itemUri, songLines } from "./db.js";
import { Ack, kv, MpdError } from "./protocol.js";
function repeatFlags() {
  const r = playerController.repeat();
  return { repeat: r !== Repeat.Off, single: r === Repeat.One };
}
function applyRepeatFlags(repeat, single) {
  playerController.setRepeat(
    !repeat ? Repeat.Off : single ? Repeat.One : Repeat.All
  );
}
const boolArg = (v, current) => v === "1" ? true : v === "0" ? false : current;
function parseRange(arg, len) {
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
function mpdVolume() {return Commands.mpdVolume(playerController.volume());}
function finiteMs(value) {return Commands.finiteMs(value??0);}
function currentIndex(st) {
  if (st && st.index != null && st.state !== "stopped") return st.index;
  if (playerController.restored) return playerController.restored.index;
  return null;
}
const statusHandler=()=>Commands.statusLines(playerController.status())(playerController.restored)(playerController.queueItems)(playerController.volume())(playerController.repeat())(playerController.isShuffle())(bus.counters.playlist);
const currentSongHandler = () => {
  const st = playerController.status();
  const idx = currentIndex(st);
  if (idx == null) return [];
  const item = playerController.queueItems[idx];
  if (!item) return [];
  return songLines(item, idx, idx);
};
const statsHandler = () => [
  kv("artists", 0),
  kv("albums", 0),
  kv("songs", playerController.queueItems.length),
  kv("uptime", 0),
  kv("playtime", 0),
  kv("db_playtime", 0),
  kv("db_update", 0)
];
async function playAt(token, index) {
  const items = playerController.queueItems;
  if (!token || index < 0 || index >= items.length) return;
  await streamAndPlay(token, items, index);
}
const playHandler = async (args, ctx) => {
  const token = ctx.getToken();
  const st = playerController.status();
  if (args[0] != null) {
    const pos = parseInt(args[0], 10);
    if (!Number.isNaN(pos)) await playAt(token, pos);
    return [];
  }
  if (playerController.restored && (!st || st.state === "stopped")) {
    if (token) await resumeSession(token);
  } else {
    playerController.play();
  }
  return [];
};
const playIdHandler = async (args, ctx) => {
  return playHandler(args, ctx);
};
const pauseHandler = (args) => {
  if (args[0] === "1") playerController.pause();
  else if (args[0] === "0") playerController.play();
  else playerController.toggle();
  return [];
};
const stopHandler = () => {
  playerController.pause();
  return [];
};
const nextHandler = async (_a, ctx) => {
  const st = playerController.status();
  const len = playerController.queueItems.length;
  const idx = st?.index ?? 0;
  let target = idx + 1;
  if (target >= len) {
    if (st?.repeat === "all") target = 0;
    else return [];
  }
  await playAt(ctx.getToken(), target);
  return [];
};
const prevHandler = async (_a, ctx) => {
  const st = playerController.status();
  const len = playerController.queueItems.length;
  const idx = st?.index ?? 0;
  let target = idx - 1;
  if (target < 0) {
    if (st?.repeat === "all") target = len - 1;
    else return [];
  }
  await playAt(ctx.getToken(), target);
  return [];
};
const seekCurHandler = (args) => {
  const raw = args[0];
  if (raw == null) throw new MpdError(Ack.ARG, "Missing time");
  const st = playerController.status();
  const curMs = st?.position_ms || 0;
  let ms;
  if (raw.startsWith("+") || raw.startsWith("-")) {
    ms = curMs + parseFloat(raw) * 1e3;
  } else {
    ms = parseFloat(raw) * 1e3;
  }
  playerController.seekMs(Math.max(0, ms));
  return [];
};
const seekHandler = async (args, ctx) => {
  const pos = parseInt(args[0], 10);
  const timeSec = parseFloat(args[1]);
  if (Number.isNaN(pos) || Number.isNaN(timeSec))
    throw new MpdError(Ack.ARG, "Bad arguments");
  const st = playerController.status();
  if (st && st.index !== pos) await playAt(ctx.getToken(), pos);
  playerController.seekMs(Math.max(0, timeSec * 1e3));
  return [];
};
const setVolHandler = (args) => {
  const v = parseInt(args[0], 10);
  if (Number.isNaN(v)) throw new MpdError(Ack.ARG, "Bad volume");
  playerController.setVolume(Math.max(0, Math.min(100, v)) / 100);
  return [];
};
const getVolHandler = () => [kv("volume", mpdVolume())];
const volumeHandler = (args) => {
  const delta = parseInt(args[0], 10);
  if (Number.isNaN(delta)) throw new MpdError(Ack.ARG, "Bad volume");
  playerController.nudgeVolume(delta / 100);
  return [];
};
const randomHandler = (args) => {
  const want = boolArg(args[0], playerController.isShuffle());
  if (playerController.isShuffle() !== want) playerController.toggleShuffle();
  return [];
};
const repeatHandler = (args) => {
  const { single } = repeatFlags();
  applyRepeatFlags(boolArg(args[0], repeatFlags().repeat), single);
  return [];
};
const singleHandler = (args) => {
  const { repeat } = repeatFlags();
  const want = args[0] === "oneshot" ? true : boolArg(args[0], repeatFlags().single);
  applyRepeatFlags(repeat || want, want);
  return [];
};
const noopOk = () => [];
function queueListing(start, end) {
  const items = playerController.queueItems;
  const lines = [];
  for (let i = start; i < end && i < items.length; i++) {
    lines.push(...songLines(items[i], i, i));
  }
  return lines;
}
const playlistInfoHandler = (args) => {
  const [start, end] = parseRange(args[0], playerController.queueItems.length);
  return queueListing(start, end);
};
const playlistIdHandler = (args) => {
  if (args[0] == null) return queueListing(0, playerController.queueItems.length);
  const id = parseInt(args[0], 10);
  return queueListing(id, id + 1);
};
const plChangesHandler = () => queueListing(0, playerController.queueItems.length);
async function resolveAddUri(uri, ctx) {
  const item = ctx.db.resolveUri(uri);
  if (item) return [item];
  throw new MpdError(Ack.NO_EXIST, `Not found: ${uri}`);
}
const addHandler = async (args, ctx) => {
  const token = ctx.getToken();
  if (!token) throw new MpdError(Ack.PERMISSION, "Not logged in");
  const items = await resolveAddUri(args[0], ctx);
  await enqueueLast(token, items);
  return [];
};
const addIdHandler = async (args, ctx) => {
  const token = ctx.getToken();
  if (!token) throw new MpdError(Ack.PERMISSION, "Not logged in");
  const items = await resolveAddUri(args[0], ctx);
  await enqueueLast(token, items);
  const id = playerController.queueItems.length - 1;
  return [kv("Id", id)];
};
const deleteHandler = (args) => {
  const [start, end] = parseRange(args[0], playerController.queueItems.length);
  for (let i = end - 1; i >= start; i--) playerController.removeAt(i);
  return [];
};
const deleteIdHandler = (args) => {
  const id = parseInt(args[0], 10);
  if (Number.isNaN(id)) throw new MpdError(Ack.ARG, "Bad song id");
  playerController.removeAt(id);
  return [];
};
const clearHandler = () => {
  playerController.close();
  bus.bump("playlist");
  return [];
};
const addUriToQueue = enqueueLast;
const FILTER_EXPR_RE = /\(\s*"?([A-Za-z_]+)"?\s*(?:==|!=|eq|contains|=~)\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g;
function parseFilter(args) {
  const joined = args.join(" ");
  if (joined.includes("(") && /==|!=|contains|=~|\beq\b/.test(joined)) {
    const out = [];
    FILTER_EXPR_RE.lastIndex = 0;
    let m;
    while ((m = FILTER_EXPR_RE.exec(joined)) !== null) {
      const raw = m[2] ?? m[3] ?? "";
      out.push({ tag: m[1], value: raw.replace(/\\(.)/g, "$1") });
    }
    if (out.length) return out;
  }
  const filter = [];
  for (let i = 0; i + 1 < args.length; i += 2) {
    filter.push({ tag: args[i], value: args[i + 1] });
  }
  return filter;
}
const listHandler = async (args, ctx) => {
  const type = (args[0] || "").toLowerCase();
  const rest = args.slice(1);
  const groupIdx = rest.findIndex((a) => a.toLowerCase() === "group");
  const groupTag = groupIdx >= 0 ? (rest[groupIdx + 1] || "").toLowerCase() : void 0;
  const filterArgs = groupIdx >= 0 ? [...rest.slice(0, groupIdx), ...rest.slice(groupIdx + 2)] : rest;
  const filters = parseFilter(filterArgs);
  const filterVal = (tag) => {
    const hit = filters.find((f) => f.tag.toLowerCase() === tag)?.value;
    if (hit != null) return hit;
    if (filterArgs.length === 1 && (tag === "artist" || tag === "albumartist"))
      return filterArgs[0];
    return void 0;
  };
  if (type === "artist") {
    return (await ctx.db.listArtists()).map((a) => kv("Artist", a));
  }
  if (type === "albumartist") {
    return (await ctx.db.albumArtists()).map((a) => kv("AlbumArtist", a));
  }
  if (type === "album") {
    const artist = filterVal("albumartist") || filterVal("artist");
    if (groupTag === "albumartist" && !artist) {
      const byArtist = /* @__PURE__ */ new Map();
      for (const a of await ctx.db.albums()) {
        const list = byArtist.get(a.albumArtist) ?? [];
        list.push(a.album);
        byArtist.set(a.albumArtist, list);
      }
      const lines = [];
      for (const [aa, albums] of byArtist) {
        lines.push(kv("AlbumArtist", aa));
        for (const al of albums) lines.push(kv("Album", al));
      }
      return lines;
    }
    return (await ctx.db.listAlbums(artist)).map((a) => kv("Album", a));
  }
  return [];
};
async function findLike(args, ctx, exact) {
  const items = await ctx.db.findSongs(parseFilter(args), exact);
  return items.flatMap((i) => songLines(i));
}
const findHandler = (args, ctx) => findLike(args, ctx, true);
const searchHandler = (args, ctx) => findLike(args, ctx, false);
async function findAdd(args, ctx, exact) {
  const token = ctx.getToken();
  if (!token) throw new MpdError(Ack.PERMISSION, "Not logged in");
  const items = await ctx.db.findSongs(parseFilter(args), exact);
  if (items.length) await addUriToQueue(token, items);
  return [];
}
const findAddHandler = (args, ctx) => findAdd(args, ctx, true);
const searchAddHandler = (args, ctx) => findAdd(args, ctx, false);
const countHandler = async (args, ctx) => {
  const items = await ctx.db.findSongs(parseFilter(args), true);
  const playtime = items.reduce(
    (s, i) => s + Math.round((i.duration || 0) / 1e3),
    0
  );
  return [kv("songs", items.length), kv("playtime", playtime)];
};
const lsInfoHandler = async (args, ctx) => {
  const uri = (args[0] || "").replace(/^\/+|\/+$/g, "");
  if (!uri) {
    return [
      kv("directory", "Artists"),
      kv("directory", "Albums"),
      kv("directory", "Playlists")
    ];
  }
  const parts = uri.split("/");
  if (parts[0] === "Artists") {
    if (parts.length === 1) {
      return (await ctx.db.albumArtists()).map(
        (a) => kv("directory", `Artists/${a}`)
      );
    }
    if (parts.length === 2) {
      return (await ctx.db.listAlbums(parts[1])).map(
        (al) => kv("directory", `Artists/${parts[1]}/${al}`)
      );
    }
    if (parts.length === 3) {
      const items = await ctx.db.albumTracks(parts[2], parts[1]);
      return items.flatMap((i) => songLines(i));
    }
  }
  if (parts[0] === "Albums") {
    if (parts.length === 1) {
      return (await ctx.db.albums()).map(
        (a) => kv("directory", `Albums/${a.album}`)
      );
    }
    if (parts.length === 2) {
      const items = await ctx.db.albumTracks(parts[1]);
      return items.flatMap((i) => songLines(i));
    }
  }
  if (parts[0] === "Playlists") {
    if (parts.length === 1) {
      return (await ctx.db.playlistNames()).map(
        (n) => kv("directory", `Playlists/${n}`)
      );
    }
    if (parts.length === 2) {
      const items = await ctx.db.playlistTracks(parts[1]);
      return items.flatMap((i) => songLines(i));
    }
  }
  return [];
};
const listAllInfoHandler = async (args, ctx) => {
  if (args[0]) return lsInfoHandler(args, ctx);
  const songs = await ctx.db.allSongs();
  return songs.flatMap((i) => songLines(i));
};
const listAllHandler = async (args, ctx) => {
  if (args[0]) return lsInfoHandler(args, ctx);
  const songs = await ctx.db.allSongs();
  return songs.map((i) => kv("file", itemUri(i)));
};
const listPlaylistsHandler = async (_a, ctx) => {
  const names = await ctx.db.playlistNames();
  return names.map((n) => kv("playlist", n));
};
const listPlaylistInfoHandler = async (args, ctx) => {
  if (!args[0]) throw new MpdError(Ack.ARG, "Missing playlist name");
  const items = await ctx.db.playlistTracks(args[0]);
  return items.flatMap((i) => songLines(i));
};
const listPlaylistHandler = async (args, ctx) => {
  if (!args[0]) throw new MpdError(Ack.ARG, "Missing playlist name");
  const items = await ctx.db.playlistTracks(args[0]);
  return items.map((i) => kv("file", itemUri(i)));
};
const loadHandler = async (args, ctx) => {
  const token = ctx.getToken();
  if (!token) throw new MpdError(Ack.PERMISSION, "Not logged in");
  if (!args[0]) throw new MpdError(Ack.ARG, "Missing playlist name");
  const items = await ctx.db.playlistTracks(args[0]);
  if (items.length) await enqueueLast(token, items);
  return [];
};
const playPlaylistHandler = loadHandler;
const outputsHandler = () => [
  kv("outputid", 0),
  kv("outputname", "Rocksky"),
  kv("outputenabled", 1)
];
const tagTypesHandler = (args) => {
  if (args.length) return [];
  return ["Artist", "Album", "AlbumArtist", "Title", "Track"].map(
    (t) => kv("tagtype", t)
  );
};
const albumArtHandler = () => {
  throw new MpdError(Ack.NO_EXIST, "No file exists");
};
const replayGainStatusHandler = () => [kv("replay_gain_mode", "off")];
let commandNames = [];
const commandsHandler = () => commandNames.map((c) => kv("command", c));
const handlers = {
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
  listall: listAllHandler,
  listallinfo: listAllInfoHandler,
  // Ask the Rocksky library to rescan storage, then re-sync our cache in the
  // background (which fires a `database` change when it actually changed).
  // Report an update job id immediately, as MPD does.
  update: (_a, ctx) => {
    void ctx.db.triggerScan().finally(() => ctx.db.sync());
    return [kv("updating_db", 1)];
  },
  rescan: (_a, ctx) => {
    void ctx.db.triggerScan().finally(() => ctx.db.sync());
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
  sendmessage: noopOk
};
commandNames = Object.keys(handlers).concat(["idle", "noidle", "close", "kill"]).sort();
export {
  commandNames,
  finiteMs,
  handlers,
  mpdVolume
};
