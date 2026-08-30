/**
 * Upload-time ReplayGain tagging.
 *
 * The desktop/wasm players apply ReplayGain from tags embedded in the audio
 * file (the rockbox engine reads them from the stream header) — files without
 * tags play at full mastered loudness no matter what the user's ReplayGain
 * setting is. Most store-bought/ripped files ship untagged, so we analyze the
 * track with ffmpeg's `replaygain` filter and write the standard
 * REPLAYGAIN_TRACK_GAIN / REPLAYGAIN_TRACK_PEAK tags before the file is
 * stored:
 *   - m4a → iTunes freeform atoms (----:com.apple.iTunes:REPLAYGAIN_*)
 *   - mp3 → ID3v2 TXXX frames
 *   - flac/ogg → vorbis comments
 * all via node-taglib-sharp, all formats the rockbox metadata parser reads.
 *
 * Any failure (no ffmpeg on the host, undecodable audio, unsupported
 * container) degrades to storing the file as-is.
 */

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { consola } from "consola";
import { File as TaglibFile } from "node-taglib-sharp";

const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";
const ANALYSIS_TIMEOUT_MS = 120_000;

/** Extensions taglib can write RG tags to and rockbox can read them from. */
export const REPLAYGAIN_EXTS = new Set(["mp3", "flac", "m4a", "ogg"]);

export interface TrackGain {
  gainDb: number;
  peak: number;
}

/** Decode the file and measure ReplayGain 1.0 track gain/peak. */
export function analyzeTrackGain(path: string): Promise<TrackGain | null> {
  return new Promise((resolve) => {
    const proc = spawn(
      FFMPEG,
      ["-hide_banner", "-nostats", "-i", path, "-map", "0:a:0", "-af", "replaygain", "-f", "null", "-"],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let stderr = "";
    const timer = setTimeout(() => proc.kill("SIGKILL"), ANALYSIS_TIMEOUT_MS);
    proc.stderr.on("data", (d) => {
      stderr += d;
    });
    proc.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return resolve(null);
      const gain = stderr.match(/track_gain\s*=\s*([-+]?\d+(?:\.\d+)?)\s*dB/);
      const peak = stderr.match(/track_peak\s*=\s*(\d+(?:\.\d+)?)/);
      if (!gain || !peak) return resolve(null);
      resolve({ gainDb: parseFloat(gain[1]), peak: parseFloat(peak[1]) });
    });
  });
}

/** Write RG track tags into the file at `path` (in place). */
export function writeTrackGain(path: string, rg: TrackGain): void {
  const f = TaglibFile.createFromPath(path);
  try {
    f.tag.replayGainTrackGain = rg.gainDb;
    f.tag.replayGainTrackPeak = rg.peak;
    f.save();
  } finally {
    f.dispose();
  }
}

/**
 * Return `buf` with ReplayGain track tags added, or `buf` unchanged when the
 * format is unsupported or analysis/tagging fails.
 */
export async function ensureReplayGain(
  buf: Buffer,
  ext: string,
): Promise<Buffer> {
  if (!REPLAYGAIN_EXTS.has(ext)) return buf;

  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), "rocksky-rg-"));
    const path = join(dir, `audio.${ext}`);
    await writeFile(path, buf);

    const rg = await analyzeTrackGain(path);
    if (!rg) {
      consola.warn("[uploads] replaygain analysis failed, storing untagged");
      return buf;
    }

    writeTrackGain(path, rg);
    const tagged = await readFile(path);
    consola.info(
      `[uploads] replaygain tagged: ${rg.gainDb.toFixed(2)} dB, peak ${rg.peak.toFixed(6)}`,
    );
    return tagged;
  } catch (e) {
    consola.warn("[uploads] replaygain tagging failed, storing untagged", e);
    return buf;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
