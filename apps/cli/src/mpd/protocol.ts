// Low-level pieces of the Music Player Daemon text protocol: the greeting, the
// argument tokenizer, and the ACK (error) format. The command semantics live in
// commands.ts; the connection/idle state machine lives in server.ts.

// Protocol version we advertise in the greeting. Clients gate features on this,
// so keep it at a real MPD release that supports everything we implement.
export const MPD_VERSION = "0.23.5";
export const GREETING = `OK MPD ${MPD_VERSION}\n`;

// MPD ACK error codes (from libmpdclient's ack.h). Only the ones we actually
// return are listed.
export const Ack = {
  NOT_LIST: 1,
  ARG: 2,
  PASSWORD: 3,
  PERMISSION: 4,
  UNKNOWN: 5,
  NO_EXIST: 50,
  PLAYLIST_MAX: 51,
  SYSTEM: 52,
  PLAYLIST_LOAD: 53,
  PLAYER_SYNC: 55,
  EXIST: 56,
} as const;

/**
 * A protocol-level failure. The server turns it into an `ACK [code@idx] {cmd}
 * message` line. Throw it from any command handler to report a client error.
 */
export class MpdError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = "MpdError";
  }
}

// Format an ACK line. `listPos` is the 0-based index of the failing command
// within a command list (0 for a bare command); `command` is the command name
// that failed.
export function ackLine(
  code: number,
  listPos: number,
  command: string,
  message: string,
): string {
  return `ACK [${code}@${listPos}] {${command}} ${message}\n`;
}

/**
 * Split an MPD request line into command + arguments. Arguments are separated
 * by whitespace, or double-quoted (with `\"` and `\\` escapes) to include
 * spaces — the form every real client uses for tags and URIs.
 */
export function tokenize(line: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  const n = line.length;
  while (i < n) {
    // Skip separating whitespace.
    while (i < n && (line[i] === " " || line[i] === "\t")) i++;
    if (i >= n) break;
    let token = "";
    if (line[i] === '"') {
      i++; // opening quote
      while (i < n && line[i] !== '"') {
        if (line[i] === "\\" && i + 1 < n) {
          token += line[i + 1];
          i += 2;
        } else {
          token += line[i++];
        }
      }
      i++; // closing quote (if present)
    } else {
      while (i < n && line[i] !== " " && line[i] !== "\t") token += line[i++];
    }
    tokens.push(token);
  }
  return tokens;
}

// Render a `key: value` response line, collapsing newlines that would corrupt
// the line-based protocol.
export function kv(key: string, value: string | number): string {
  const v = String(value).replace(/\r?\n/g, " ");
  return `${key}: ${v}\n`;
}
