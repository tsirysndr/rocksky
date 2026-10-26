import { type QueueItem } from "./player.js";
export declare function streamAndPlay(token: string, tracks: QueueItem[], index?: number): any;
/** Insert tracks right after the current one ("play next"). Caches first. */
export declare function enqueueNext(token: string, tracks: QueueItem[]): any;
/** Append tracks to the end of the queue ("play last"). Caches first. */
export declare function enqueueLast(token: string, tracks: QueueItem[]): any;
/** Insert tracks at any rockbox InsertPosition. */
export declare function enqueueAt(token: string, tracks: QueueItem[], position: number): any;
/**
 * Resume the session restored on startup: rebuild playable entries (cached
 * where possible), start at the saved track, and seek to the saved position.
 */
export declare function resumeSession(token: string): any;
/** True while a background track download is running (for a buffering hint). */
export declare function isPrefetching(): boolean;
export declare function jumpTo(token: string, targetIndex: number): any;
/** Skip to the next track (rebuilds with cache, so it plays local, no buffer). */
export declare function skipNext(token: string): any;
/** Skip to the previous track (same reliable rebuild path). */
export declare function skipPrev(token: string): any;
export declare function prefetchTick(token: string | undefined): any;
