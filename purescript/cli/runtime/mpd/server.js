import net from "net";
import { itemUri, MpdDb } from "./db.js";
import { playerController } from "../tui/player.js";
import { bus, SUBSYSTEMS } from "./bus.js";
import { commandNames, handlers, mpdVolume } from "./commands.js";
import { Ack, ackLine, GREETING, kv, MpdError, tokenize } from "./protocol.js";
async function startMpdServer(opts) {
  const log = opts.log ?? (() => {
  });
  const db = new MpdDb(opts.getToken);
  const ctx = { getToken: opts.getToken, db };
  db.preload();
  db.onLibraryChange = () => bus.bump("database");
  const SYNC_INTERVAL_MS = 5 * 6e4;
  const syncTimer = setInterval(() => void db.sync(), SYNC_INTERVAL_MS);
  syncTimer.unref?.();
  const write = (conn, s) => {
    if (!conn.closed) conn.socket.write(s);
  };
  const changedLines = (subs) => subs.map((s) => kv("changed", s)).join("");
  function endIdle(conn, emitOk) {
    if (!conn.idle) {
      if (emitOk) write(conn, "OK\n");
      return;
    }
    conn.idle.unsub();
    conn.idle = null;
    if (emitOk) write(conn, "OK\n");
  }
  function startIdle(conn, args) {
    const requested = args.length ? args.filter((a) => SUBSYSTEMS.includes(a)) : [...SUBSYSTEMS];
    const pending = requested.filter((s) => bus.counters[s] > conn.seen[s]);
    if (pending.length) {
      pending.forEach((s) => conn.seen[s] = bus.counters[s]);
      write(conn, changedLines(pending) + "OK\n");
      return;
    }
    const unsub = bus.subscribe(() => {
      if (!conn.idle) return;
      const ch = requested.filter((s) => bus.counters[s] > conn.seen[s]);
      if (!ch.length) return;
      ch.forEach((s) => conn.seen[s] = bus.counters[s]);
      write(conn, changedLines(ch) + "OK\n");
      endIdle(conn, false);
    });
    conn.idle = { requested, unsub };
  }
  async function runOne(conn, cmd, args, listPos) {
    const handler = handlers[cmd.toLowerCase()];
    if (!handler) {
      return {
        error: ackLine(Ack.UNKNOWN, listPos, cmd, `unknown command "${cmd}"`)
      };
    }
    try {
      const lines = await handler(args, ctx);
      return { body: lines.join("") };
    } catch (e) {
      const code = e instanceof MpdError ? e.code : Ack.SYSTEM;
      return { error: ackLine(code, listPos, cmd, e?.message || "error") };
    }
  }
  async function runList(conn, cmds, listOk) {
    let out = "";
    for (let i = 0; i < cmds.length; i++) {
      const [cmd, ...args] = tokenize(cmds[i]);
      if (!cmd) continue;
      const res = await runOne(conn, cmd, args, i);
      if ("error" in res) {
        write(conn, out + res.error);
        return;
      }
      out += res.body;
      if (listOk) out += "list_OK\n";
    }
    write(conn, out + "OK\n");
  }
  async function handleLine(conn, raw) {
    const line = raw.replace(/\r$/, "");
    if (conn.idle) {
      endIdle(conn, true);
      const t = line.trim();
      if (t === "" || t.toLowerCase() === "noidle") return;
    }
    const trimmed = line.trim();
    if (trimmed === "") return;
    if (conn.inList) {
      if (trimmed === "command_list_end") {
        const cmds = conn.listCmds;
        const listOk = conn.listOk;
        conn.inList = false;
        conn.listCmds = [];
        await runList(conn, cmds, listOk);
        return;
      }
      conn.listCmds.push(line);
      return;
    }
    if (trimmed === "command_list_begin") {
      conn.inList = true;
      conn.listOk = false;
      conn.listCmds = [];
      return;
    }
    if (trimmed === "command_list_ok_begin") {
      conn.inList = true;
      conn.listOk = true;
      conn.listCmds = [];
      return;
    }
    const [cmd, ...args] = tokenize(line);
    if (!cmd) return;
    const name = cmd.toLowerCase();
    if (name === "idle") return startIdle(conn, args);
    if (name === "noidle") return;
    if (name === "close") return void conn.socket.end();
    if (name === "kill")
      return void write(conn, ackLine(Ack.PERMISSION, 0, cmd, "kill not permitted"));
    if (name === "binarylimit") {
      const n = parseInt(args[0], 10);
      if (n > 0) conn.binaryLimit = n;
      return void write(conn, "OK\n");
    }
    if (name === "albumart" || name === "readpicture") {
      return sendAlbumArt(conn, cmd, args, name === "readpicture");
    }
    const res = await runOne(conn, cmd, args, 0);
    write(conn, "error" in res ? res.error : res.body + "OK\n");
  }
  async function sendAlbumArt(conn, cmd, args, withType) {
    const uri = args[0];
    const offset = Math.max(0, parseInt(args[1] || "0", 10) || 0);
    if (!uri) {
      return void write(conn, ackLine(Ack.ARG, 0, cmd, "Missing uri"));
    }
    let art = null;
    try {
      art = await db.coverArt(uri);
    } catch {
      art = null;
    }
    if (!art || art.data.length === 0) {
      return void write(conn, ackLine(Ack.NO_EXIST, 0, cmd, "No cover art"));
    }
    const total = art.data.length;
    const chunk = art.data.subarray(offset, offset + conn.binaryLimit);
    const header = `size: ${total}
` + (withType ? `type: ${art.mime}
` : "") + `binary: ${chunk.length}
`;
    if (!conn.closed) {
      conn.socket.write(
        Buffer.concat([Buffer.from(header), chunk, Buffer.from("\nOK\n")])
      );
    }
  }
  async function pump(conn) {
    if (conn.pumping) return;
    conn.pumping = true;
    try {
      while (conn.lines.length && !conn.closed) {
        await handleLine(conn, conn.lines.shift());
      }
    } finally {
      conn.pumping = false;
    }
  }
  const server = net.createServer((socket) => {
    const conn = {
      socket,
      buf: "",
      lines: [],
      pumping: false,
      closed: false,
      inList: false,
      listOk: false,
      listCmds: [],
      idle: null,
      seen: bus.snapshot(),
      binaryLimit: 8192
    };
    socket.setEncoding("utf-8");
    socket.write(GREETING);
    socket.on("data", (chunk) => {
      conn.buf += chunk;
      let nl;
      while ((nl = conn.buf.indexOf("\n")) !== -1) {
        conn.lines.push(conn.buf.slice(0, nl));
        conn.buf = conn.buf.slice(nl + 1);
      }
      void pump(conn);
    });
    const cleanup = () => {
      conn.closed = true;
      if (conn.idle) conn.idle.unsub();
    };
    socket.on("close", cleanup);
    socket.on("error", cleanup);
  });
  let last = snapshot();
  const poller = setInterval(() => {
    const s = snapshot();
    const sameTrack = s.index === last.index && s.curId === last.curId;
    const seeked = sameTrack && Math.abs(s.posSec - last.posSec) > 2;
    if (s.state !== last.state || s.index !== last.index || s.curId !== last.curId || s.durSec !== last.durSec || // duration became known (0 -> total)
    s.started !== last.started || // position began advancing / reset to 0
    seeked)
      bus.bump("player");
    if (s.vol !== last.vol) bus.bump("mixer");
    if (s.shuffle !== last.shuffle || s.repeat !== last.repeat)
      bus.bump("options");
    if (s.qlen !== last.qlen || s.qsig !== last.qsig) bus.bump("playlist");
    last = s;
  }, 500);
  poller.unref?.();
  const port = await listen(
    server,
    opts.port,
    opts.bind ?? "127.0.0.1",
    opts.portFallbacks ?? 20,
    log
  );
  return {
    port,
    close: () => {
      clearInterval(poller);
      clearInterval(syncTimer);
      server.close();
      void db.close();
    }
  };
}
function snapshot() {
  const st = playerController.status();
  const items = playerController.queueItems;
  const idx = st?.index ?? -1;
  const posMs = st?.position_ms ?? 0;
  const durMs = st?.duration_ms || items[idx]?.duration || 0;
  return {
    state: st?.state ?? "stopped",
    index: idx,
    curId: items[idx] ? itemUri(items[idx]) : "",
    vol: mpdVolume(),
    shuffle: playerController.isShuffle(),
    repeat: playerController.repeat(),
    qlen: items.length,
    qsig: items.map((i) => i.uploadId || i.trackId || "").join("|"),
    // Timing readiness. MPD clients seed their local elapsed-interpolation from
    // one `status` read and only re-baseline on a `changed: player` event. When
    // playback starts, the engine briefly reports `playing` with position 0 and
    // no duration (codec still spinning up); a client that reads then latches
    // 0:00 with no total and — absent another player event — never recovers.
    // Track when timing becomes available (duration known, position advancing)
    // and when the position jumps (a seek from another client) so the poller
    // emits a player event that makes clients re-read and resync.
    durSec: Number.isFinite(durMs) ? Math.round(durMs / 1e3) : 0,
    started: Number.isFinite(posMs) && posMs > 0,
    posSec: Number.isFinite(posMs) ? Math.round(posMs / 1e3) : 0
  };
}
function listen(server, port, bind, fallbacks, log) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      if (err.code === "EADDRINUSE" && fallbacks > 0) {
        server.removeListener("error", onError);
        log(`port ${port} in use, trying ${port + 1}`);
        resolve(listen(server, port + 1, bind, fallbacks - 1, log));
      } else {
        reject(err);
      }
    };
    server.once("error", onError);
    server.listen(port, bind, () => {
      server.removeListener("error", onError);
      resolve(port);
    });
  });
}
export {
  commandNames,
  startMpdServer
};
