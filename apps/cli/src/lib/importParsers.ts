import fs from "node:fs";
import path from "node:path";

/**
 * A single listen, normalized across the different export formats we know how
 * to read (Spotify Extended Streaming History, Last.fm CSV/JSON). This is the
 * common shape the `import` command feeds into `@rocksky/sdk`'s
 * `Agent.scrobbleMatch` — title + artist are always present, everything else
 * is an optional match anchor / override.
 */
export interface ImportedScrobble {
  title: string;
  artist: string;
  album?: string;
  albumArtist?: string;
  /** MusicBrainz recording id (Last.fm exports carry it; anchors the match). */
  mbId?: string;
  isrc?: string;
  /** Scrobbled-at time, Unix seconds. */
  timestamp: number;
  /** Milliseconds actually played (Spotify only) — used for the skip filter. */
  msPlayed?: number;
  source: ImportFormat;
}

export type ImportFormat = "spotify" | "lastfm";

export interface ParseResult {
  format: ImportFormat;
  scrobbles: ImportedScrobble[];
  /** Files that were read (a Spotify export is usually a directory of many). */
  files: string[];
  /** Records that were present but skipped, with a reason -> count. */
  skipped: Record<string, number>;
}

/* -------------------------------------------------------------------------- */
/*  Autodetection + entry point                                               */
/* -------------------------------------------------------------------------- */

/**
 * Read a Spotify or Last.fm export from `target` (a file or a directory) and
 * normalize it. The format is autodetected from the path shape and the file
 * contents unless `force` is given.
 */
export function parseImport(
  target: string,
  opts: { force?: ImportFormat; minSeconds?: number } = {},
): ParseResult {
  if (!fs.existsSync(target)) {
    throw new Error(`No such file or directory: ${target}`);
  }

  const stat = fs.statSync(target);

  // A directory is only ever a Spotify Extended Streaming History export.
  if (stat.isDirectory()) {
    const files = spotifyFilesIn(target);
    if (!files.length) {
      throw new Error(
        `No Spotify "Streaming_History_Audio_*.json" files found in ${target}`,
      );
    }
    return parseSpotifyFiles(files, opts.minSeconds ?? DEFAULT_MIN_SECONDS);
  }

  const format = opts.force ?? detectFormat(target);

  switch (format) {
    case "spotify":
      return parseSpotifyFiles([target], opts.minSeconds ?? DEFAULT_MIN_SECONDS);
    case "lastfm":
      return parseLastfmFile(target);
    default:
      throw new Error(`Unsupported import format: ${format}`);
  }
}

const DEFAULT_MIN_SECONDS = 30;

/** Sniff the format from the extension and the first chunk of content. */
export function detectFormat(file: string): ImportFormat {
  const ext = path.extname(file).toLowerCase();
  const head = readHead(file, 64 * 1024);

  if (ext === ".csv") {
    return detectCsvFormat(head);
  }

  if (ext === ".json" || head.trimStart().startsWith("[") || head.trimStart().startsWith("{")) {
    // Spotify records are unmistakable.
    if (
      head.includes("master_metadata_track_name") ||
      head.includes("spotify_track_uri") ||
      (head.includes('"ts"') && head.includes('"ms_played"'))
    ) {
      return "spotify";
    }
    // Otherwise assume a Last.fm-style JSON dump (user.getRecentTracks shape).
    return "lastfm";
  }

  // Fall back to CSV sniffing for extension-less files.
  return detectCsvFormat(head);
}

function detectCsvFormat(head: string): ImportFormat {
  const header = head.split(/\r?\n/, 1)[0]?.toLowerCase() ?? "";
  if (header.includes("uts") || (header.includes("track") && header.includes("artist"))) {
    return "lastfm";
  }
  if (header.includes("master_metadata_track_name") || header.includes("spotify_track_uri")) {
    return "spotify";
  }
  throw new Error(
    "Could not autodetect import format. Pass --format spotify|lastfm.",
  );
}

function spotifyFilesIn(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .filter((f) => /^Streaming_History_Audio_.*\.json$/i.test(f))
    .sort()
    .map((f) => path.join(dir, f));
}

/* -------------------------------------------------------------------------- */
/*  Spotify Extended Streaming History                                        */
/* -------------------------------------------------------------------------- */

interface SpotifyEntry {
  ts: string;
  ms_played: number;
  master_metadata_track_name: string | null;
  master_metadata_album_artist_name: string | null;
  master_metadata_album_album_name: string | null;
  spotify_track_uri: string | null;
  episode_name: string | null;
}

function parseSpotifyFiles(files: string[], minSeconds: number): ParseResult {
  const scrobbles: ImportedScrobble[] = [];
  const skipped: Record<string, number> = {};
  const bump = (reason: string) => (skipped[reason] = (skipped[reason] ?? 0) + 1);
  const minMs = Math.max(0, minSeconds) * 1000;

  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(file, "utf-8"));
    if (!Array.isArray(data)) {
      throw new Error(`Expected a JSON array in ${file}`);
    }

    for (const entry of data as SpotifyEntry[]) {
      const title = entry.master_metadata_track_name;
      const artist = entry.master_metadata_album_artist_name;

      // Podcasts, audiobooks and videos have no track metadata.
      if (!title || !artist) {
        bump("not-a-track");
        continue;
      }
      if ((entry.ms_played ?? 0) < minMs) {
        bump(`played-under-${minSeconds}s`);
        continue;
      }

      const timestamp = Math.floor(Date.parse(entry.ts) / 1000);
      if (!Number.isFinite(timestamp)) {
        bump("bad-timestamp");
        continue;
      }

      scrobbles.push({
        title,
        artist,
        album: entry.master_metadata_album_album_name ?? undefined,
        timestamp,
        msPlayed: entry.ms_played,
        source: "spotify",
      });
    }
  }

  return finalize("spotify", scrobbles, files, skipped);
}

/* -------------------------------------------------------------------------- */
/*  Last.fm — CSV and JSON                                                     */
/* -------------------------------------------------------------------------- */

function parseLastfmFile(file: string): ParseResult {
  const ext = path.extname(file).toLowerCase();
  const raw = fs.readFileSync(file, "utf-8");
  if (ext === ".json" || raw.trimStart().startsWith("[") || raw.trimStart().startsWith("{")) {
    return parseLastfmJson(file, raw);
  }
  return parseLastfmCsv(file, raw);
}

/** Last.fm CSV export: `uts,utc_time,artist,artist_mbid,album,album_mbid,track,track_mbid`. */
function parseLastfmCsv(file: string, raw: string): ParseResult {
  const rows = parseCsv(raw);
  if (!rows.length) return finalize("lastfm", [], [file], {});

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const iUts = col("uts");
  const iArtist = col("artist");
  const iAlbum = col("album");
  const iTrack = col("track");
  const iTrackMbid = col("track_mbid");

  if (iTrack < 0 || iArtist < 0) {
    throw new Error(
      `Unrecognized Last.fm CSV header in ${file}: ${header.join(",")}`,
    );
  }

  const scrobbles: ImportedScrobble[] = [];
  const skipped: Record<string, number> = {};
  const bump = (reason: string) => (skipped[reason] = (skipped[reason] ?? 0) + 1);

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const title = (r[iTrack] ?? "").trim();
    const artist = (r[iArtist] ?? "").trim();
    if (!title || !artist) {
      bump("missing-title-or-artist");
      continue;
    }
    const timestamp = parseInt((r[iUts] ?? "").trim(), 10);
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
      bump("bad-timestamp");
      continue;
    }
    const album = iAlbum >= 0 ? (r[iAlbum] ?? "").trim() : "";
    const mbId = iTrackMbid >= 0 ? (r[iTrackMbid] ?? "").trim() : "";
    scrobbles.push({
      title,
      artist,
      album: album || undefined,
      mbId: mbId || undefined,
      timestamp,
      source: "lastfm",
    });
  }

  return finalize("lastfm", scrobbles, [file], skipped);
}

/**
 * Last.fm JSON dump — the `user.getRecentTracks` shape most exporters emit:
 * `{ name, artist: {#text}|string, album: {#text}|string, mbid, date: {uts}|number }`.
 */
function parseLastfmJson(file: string, raw: string): ParseResult {
  const parsed = JSON.parse(raw);
  const list: any[] = Array.isArray(parsed)
    ? parsed
    : (parsed?.recenttracks?.track ?? parsed?.track ?? parsed?.scrobbles ?? []);

  const scrobbles: ImportedScrobble[] = [];
  const skipped: Record<string, number> = {};
  const bump = (reason: string) => (skipped[reason] = (skipped[reason] ?? 0) + 1);

  const text = (v: any): string =>
    typeof v === "string" ? v : (v?.["#text"] ?? v?.name ?? "");

  for (const it of list) {
    // Now-playing entries carry no timestamp; skip them.
    if (it?.["@attr"]?.nowplaying === "true") {
      bump("now-playing");
      continue;
    }
    const title = text(it?.name ?? it?.track ?? it?.title).trim();
    const artist = text(it?.artist).trim();
    if (!title || !artist) {
      bump("missing-title-or-artist");
      continue;
    }
    const uts = it?.date?.uts ?? it?.date ?? it?.uts ?? it?.timestamp;
    const timestamp = parseInt(String(uts ?? ""), 10);
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
      bump("bad-timestamp");
      continue;
    }
    const album = text(it?.album).trim();
    const mbId = (it?.mbid ?? it?.track_mbid ?? "").toString().trim();
    scrobbles.push({
      title,
      artist,
      album: album || undefined,
      mbId: mbId || undefined,
      timestamp,
      source: "lastfm",
    });
  }

  return finalize("lastfm", scrobbles, [file], skipped);
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Sort chronologically and drop exact (title, artist, timestamp) duplicates. */
function finalize(
  format: ImportFormat,
  scrobbles: ImportedScrobble[],
  files: string[],
  skipped: Record<string, number>,
): ParseResult {
  scrobbles.sort((a, b) => a.timestamp - b.timestamp);

  const seen = new Set<string>();
  const deduped: ImportedScrobble[] = [];
  let dupes = 0;
  for (const s of scrobbles) {
    const key = `${s.timestamp}|${s.title.toLowerCase()}|${s.artist.toLowerCase()}`;
    if (seen.has(key)) {
      dupes++;
      continue;
    }
    seen.add(key);
    deduped.push(s);
  }
  if (dupes) skipped["duplicate-in-file"] = dupes;

  return { format, scrobbles: deduped, files, skipped };
}

/** Read up to `bytes` from the start of a file without loading the whole thing. */
function readHead(file: string, bytes: number): string {
  const fd = fs.openSync(file, "r");
  try {
    const buf = Buffer.alloc(bytes);
    const read = fs.readSync(fd, buf, 0, bytes, 0);
    return buf.subarray(0, read).toString("utf-8");
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Minimal RFC-4180 CSV parser: handles quoted fields, embedded commas,
 * escaped `""` quotes and CRLF/LF newlines. Returns rows of string cells.
 */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const c = input[i];

    if (inQuotes) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // swallow; the following \n closes the row
    } else {
      field += c;
    }
  }

  // Flush a trailing field/row that didn't end in a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}
