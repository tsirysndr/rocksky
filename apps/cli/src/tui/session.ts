import fs from "fs";
import os from "os";
import path from "path";
import type { QueueItem } from "./player";

export interface SessionState {
  queue: QueueItem[];
  index: number;
  positionMs: number;
}

const sessionPath = () =>
  path.join(os.homedir(), ".rocksky", "tui-session.json");

/** Load the persisted playback session (queue + position), or null. */
export function loadSession(): SessionState | null {
  try {
    const data = JSON.parse(fs.readFileSync(sessionPath(), "utf-8"));
    if (!Array.isArray(data.queue) || data.queue.length === 0) return null;
    return {
      queue: data.queue,
      index: typeof data.index === "number" ? data.index : 0,
      positionMs: typeof data.positionMs === "number" ? data.positionMs : 0,
    };
  } catch {
    return null;
  }
}

export function saveSession(state: SessionState | null): void {
  try {
    if (!state) return;
    fs.mkdirSync(path.dirname(sessionPath()), { recursive: true });
    fs.writeFileSync(sessionPath(), JSON.stringify(state));
  } catch {
    // best-effort
  }
}

export function clearSession(): void {
  try {
    fs.rmSync(sessionPath(), { force: true });
  } catch {
    // ignore
  }
}
