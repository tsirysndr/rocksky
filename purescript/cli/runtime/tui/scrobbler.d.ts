import { type QueueItem } from "./player.js";
/**
 * Called on a short interval. Watches the player's position and submits a
 * scrobble once the Last.fm threshold is reached for the current track.
 */
export declare function scrobblerTick(token: string | undefined, onScrobbled?: (item: QueueItem) => void): void;
