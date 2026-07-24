import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Resumable checkpointing for `rocksky import`. Every import source (a file or
 * the Spotify history folder) gets a small JSON checkpoint under
 * `~/.rocksky/import-checkpoints/`. The checkpoint records the *last
 * contiguously-imported scrobble* so that a restart resumes exactly after it —
 * without re-walking (or re-rate-limiting) everything that already succeeded.
 *
 * "Contiguous" matters: with concurrent workers, scrobbles can finish out of
 * order. We only advance the checkpoint across the unbroken prefix of completed
 * scrobbles, so a failure (or a Ctrl-C mid-flight) never leaves a gap that
 * resume would skip over.
 */

/** Identity of a scrobble, stable across re-parses of the same source+flags. */
export interface ScrobbleId {
  timestamp: number;
  title: string;
  artist: string;
}

export interface Checkpoint {
  /** Absolute path of the import source, for humans reading the file. */
  source: string;
  format: string;
  /** Last contiguously-imported scrobble, plus how many were done. */
  cursor: (ScrobbleId & { count: number }) | null;
  updatedAt: string;
}

const DIR = path.join(os.homedir(), ".rocksky", "import-checkpoints");

export function checkpointPath(source: string): string {
  const key = crypto
    .createHash("sha1")
    .update(path.resolve(source))
    .digest("hex")
    .slice(0, 16);
  return path.join(DIR, `${key}.json`);
}

export function loadCheckpoint(source: string): Checkpoint | null {
  try {
    return JSON.parse(fs.readFileSync(checkpointPath(source), "utf-8"));
  } catch {
    return null;
  }
}

export function saveCheckpoint(cp: Checkpoint): void {
  fs.mkdirSync(DIR, { recursive: true });
  const file = checkpointPath(cp.source);
  // Write atomically so a crash mid-write never corrupts the checkpoint.
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cp, null, 2));
  fs.renameSync(tmp, file);
}

export function clearCheckpoint(source: string): void {
  try {
    fs.unlinkSync(checkpointPath(source));
  } catch {
    /* already gone */
  }
}

function sameId(a: ScrobbleId, b: ScrobbleId): boolean {
  return a.timestamp === b.timestamp && a.title === b.title && a.artist === b.artist;
}

/**
 * Given a freshly-parsed (sorted, deduped) list and a saved cursor, return the
 * index to resume from — i.e. the position right after the cursor's scrobble.
 * Returns 0 when there's no cursor or it can't be located (source changed), so
 * the import safely restarts from the top (the dedup index still guards writes).
 */
export function resumeIndex(scrobbles: ScrobbleId[], cursor: ScrobbleId | null): number {
  if (!cursor) return 0;
  for (let i = 0; i < scrobbles.length; i++) {
    if (sameId(scrobbles[i], cursor)) return i + 1;
  }
  return 0;
}

/**
 * Tracks the high-water mark of the *contiguous* completed prefix. `complete(i)`
 * records a finished index and returns true when the contiguous mark advanced
 * (the caller then persists the checkpoint at {@link ContiguousTracker.mark}).
 */
export class ContiguousTracker {
  private done = new Set<number>();
  private _mark = -1;

  complete(i: number): boolean {
    this.done.add(i);
    let advanced = false;
    while (this.done.has(this._mark + 1)) {
      this._mark++;
      advanced = true;
    }
    return advanced;
  }

  /** Index of the last scrobble in the unbroken completed prefix (-1 if none). */
  get mark(): number {
    return this._mark;
  }
}
