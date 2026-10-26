import type { QueueItem } from "./player.js";
export interface SessionState {
    queue: QueueItem[];
    index: number;
    positionMs: number;
}
/** Load the persisted playback session (queue + position), or null. */
export declare function loadSession(): SessionState | null;
export declare function saveSession(state: SessionState | null): void;
export declare function clearSession(): void;
