// The MPD TCP server: accepts client connections, drives the command-list /
// idle state machine, and polls the player so `idle` clients get change events.
// It's a thin front-end — all behaviour lives in commands.ts, which operates on
// the same playerController singleton the TUI uses. Safe to run both inside the
// TUI and in the standalone `rocksky mpd` daemon.

import net from "net";
import { itemUri, MpdDb } from "./db";
import { playerController } from "../tui/player";
import { bus, SUBSYSTEMS, type Subsystem } from "./bus";
import { commandNames, type Ctx, handlers, mpdVolume } from "./commands";
import { Ack, ackLine, GREETING, kv, MpdError, tokenize } from "./protocol";

export interface MpdServerOptions {
  getToken: () => string | undefined;
  port: number;
  bind?: string;
  // How many increments to try if the desired port is busy.
  portFallbacks?: number;
  log?: (msg: string) => void;
}

export interface MpdServerHandle {
  port: number;
  close: () => void;
}

interface Conn {
  socket: net.Socket;
  buf: string;
  lines: string[];
  pumping: boolean;
  closed: boolean;
  inList: boolean;
  listOk: boolean;
  listCmds: string[];
  idle: { requested: Subsystem[]; unsub: () => void } | null;
  seen: Record<Subsystem, number>;
  binaryLimit: number; // max bytes per albumart/readpicture chunk
}

export async function startMpdServer(
  opts: MpdServerOptions,
): Promise<MpdServerHandle> {
  const log = opts.log ?? (() => {});
  const db = new MpdDb(opts.getToken);
  const ctx: Ctx = { getToken: opts.getToken, db };

  // Preload the whole library (from the persistent cache, then a background
  // network refresh) at startup so the first browse from a client is instant
  // instead of racing its command timeout.
  db.preload();

  // Keep the cache in sync with the API in the background: re-fetch on an
  // interval, and notify idle clients (`database` subsystem) when it changed.
  db.onLibraryChange = () => bus.bump("database");
  const SYNC_INTERVAL_MS = 5 * 60_000;
  const syncTimer = setInterval(() => void db.sync(), SYNC_INTERVAL_MS);
  syncTimer.unref?.();

  const write = (conn: Conn, s: string) => {
    if (!conn.closed) conn.socket.write(s);
  };

  const changedLines = (subs: Subsystem[]) =>
    subs.map((s) => kv("changed", s)).join("");

  function endIdle(conn: Conn, emitOk: boolean) {
    if (!conn.idle) {
      if (emitOk) write(conn, "OK\n");
      return;
    }
    conn.idle.unsub();
    conn.idle = null;
    if (emitOk) write(conn, "OK\n");
  }

  function startIdle(conn: Conn, args: string[]) {
    const requested = (
      args.length
        ? (args.filter((a) => SUBSYSTEMS.includes(a as Subsystem)) as Subsystem[])
        : [...SUBSYSTEMS]
    );
    const pending = requested.filter((s) => bus.counters[s] > conn.seen[s]);
    if (pending.length) {
      pending.forEach((s) => (conn.seen[s] = bus.counters[s]));
      write(conn, changedLines(pending) + "OK\n");
      return;
    }
    const unsub = bus.subscribe(() => {
      if (!conn.idle) return;
      const ch = requested.filter((s) => bus.counters[s] > conn.seen[s]);
      if (!ch.length) return;
      ch.forEach((s) => (conn.seen[s] = bus.counters[s]));
      write(conn, changedLines(ch) + "OK\n");
      endIdle(conn, false);
    });
    conn.idle = { requested, unsub };
  }

  async function runOne(
    conn: Conn,
    cmd: string,
    args: string[],
    listPos: number,
  ): Promise<{ body: string } | { error: string }> {
    const handler = handlers[cmd.toLowerCase()];
    if (!handler) {
      return {
        error: ackLine(Ack.UNKNOWN, listPos, cmd, `unknown command "${cmd}"`),
      };
    }
    try {
      const lines = await handler(args, ctx);
      return { body: lines.join("") };
    } catch (e: any) {
      const code = e instanceof MpdError ? e.code : Ack.SYSTEM;
      return { error: ackLine(code, listPos, cmd, e?.message || "error") };
    }
  }

  async function runList(conn: Conn, cmds: string[], listOk: boolean) {
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

  async function handleLine(conn: Conn, raw: string) {
    const line = raw.replace(/\r$/, "");

    // Any input while idle cancels the idle (like `noidle`) before processing.
    if (conn.idle) {
      endIdle(conn, true);
      const t = line.trim();
      if (t === "" || t.toLowerCase() === "noidle") return;
      // otherwise fall through and run the received command
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
    if (name === "noidle") return void write(conn, "OK\n");
    if (name === "close") return void conn.socket.end();
    if (name === "kill")
      return void write(conn, ackLine(Ack.PERMISSION, 0, cmd, "kill not permitted"));
    // Binary-chunk negotiation + cover art need raw output / socket state, so
    // they're handled here rather than as string-returning handlers.
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

  // Serve a cover-art chunk in MPD's binary framing:
  //   size: <total>\n [type: <mime>\n] binary: <chunk>\n <bytes> \n OK\n
  // The client re-requests with increasing offset until it has `size` bytes.
  async function sendAlbumArt(
    conn: Conn,
    cmd: string,
    args: string[],
    withType: boolean,
  ) {
    const uri = args[0];
    const offset = Math.max(0, parseInt(args[1] || "0", 10) || 0);
    if (!uri) {
      return void write(conn, ackLine(Ack.ARG, 0, cmd, "Missing uri"));
    }
    let art: { data: Buffer; mime: string } | null = null;
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
    const header =
      `size: ${total}\n` +
      (withType ? `type: ${art.mime}\n` : "") +
      `binary: ${chunk.length}\n`;
    if (!conn.closed) {
      conn.socket.write(
        Buffer.concat([Buffer.from(header), chunk, Buffer.from("\nOK\n")]),
      );
    }
  }

  async function pump(conn: Conn) {
    if (conn.pumping) return;
    conn.pumping = true;
    try {
      while (conn.lines.length && !conn.closed) {
        await handleLine(conn, conn.lines.shift()!);
      }
    } finally {
      conn.pumping = false;
    }
  }

  const server = net.createServer((socket) => {
    const conn: Conn = {
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
      binaryLimit: 8192,
    };
    socket.setEncoding("utf-8");
    socket.write(GREETING);

    socket.on("data", (chunk: string) => {
      conn.buf += chunk;
      let nl: number;
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

  // Poll the player and translate state deltas into subsystem change events so
  // idle clients (ncmpcpp, mpc idle) refresh. Uses a poll instead of the
  // player's single-slot onQueueChange/onSettingsChange hooks so it never
  // clobbers the TUI, which owns those hooks.
  let last = snapshot();
  const poller = setInterval(() => {
    const s = snapshot();
    if (s.state !== last.state || s.index !== last.index || s.curId !== last.curId)
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
    log,
  );

  return {
    port,
    close: () => {
      clearInterval(poller);
      clearInterval(syncTimer);
      server.close();
      void db.close();
    },
  };
}

function snapshot() {
  const st = playerController.status();
  const items = playerController.queueItems;
  const idx = st?.index ?? -1;
  return {
    state: st?.state ?? "stopped",
    index: idx,
    curId: items[idx] ? itemUri(items[idx]) : "",
    vol: mpdVolume(),
    shuffle: playerController.isShuffle(),
    repeat: playerController.repeat(),
    qlen: items.length,
    qsig: items.map((i) => i.uploadId || i.trackId || "").join("|"),
  };
}

// Bind `server` to `port`, incrementing on EADDRINUSE up to `fallbacks` times.
// Resolves with the port actually bound.
function listen(
  server: net.Server,
  port: number,
  bind: string,
  fallbacks: number,
  log: (msg: string) => void,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
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

// Re-export so the daemon can print the supported command list if needed.
export { commandNames };
