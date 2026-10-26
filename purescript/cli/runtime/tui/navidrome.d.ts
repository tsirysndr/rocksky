import type { QueueItem } from "./player.js";
export declare const NAVIDROME_URL = "https://navidrome.rocksky.app";
export interface NavidromeCreds {
    handle: string;
    apiKey: string;
}
/**
 * Subsonic credentials for the Navidrome-compatible API: the user's handle plus
 * a dedicated Rocksky API key (created once and cached in ~/.rocksky).
 */
export declare function getCreds(token?: string): Promise<NavidromeCreds | null>;
/** The signed-in user's DID — it can't change within a session, so cache it. */
export declare function getDid(token: string): Promise<string>;
export interface Playlist {
    id: string;
    name: string;
    songCount: number;
    comment?: string;
    /** AT-URI of the app.rocksky.playlist record this playlist is mirrored to. */
    uri?: string;
}
export interface Album {
    id: string;
    name: string;
    artist: string;
    songCount: number;
    /** AT-URI of the app.rocksky.album record this album belongs to. */
    uri?: string;
}
export interface PlaylistEntry {
    id: string;
    title: string;
    artist: string;
    album?: string;
    duration?: number;
}
export declare function getPlaylists(creds: NavidromeCreds): Promise<Playlist[]>;
export declare function star(creds: NavidromeCreds, songId: string): unknown;
export declare function unstar(creds: NavidromeCreds, songId: string): unknown;
/** The user's starred (loved) songs that are streamable via Navidrome. */
export declare function getStarred(creds: NavidromeCreds): Promise<PlaylistEntry[]>;
export declare function getPlaylist(creds: NavidromeCreds, id: string): Promise<{
    playlist: Playlist;
    entries: PlaylistEntry[];
}>;
export declare function getAlbum(creds: NavidromeCreds, id: string): Promise<{
    album: Album;
    entries: PlaylistEntry[];
}>;
export declare function createPlaylist(token: string, name: string): Promise<string | undefined>;
export declare function deletePlaylist(token: string, id: string): Promise<Record<string, unknown>>;
export declare function addTrackToPlaylist(token: string, playlistId: string, songId: string): Promise<Record<string, unknown>>;
export declare function removeTrackFromPlaylist(token: string, playlistId: string, index: number): Promise<Record<string, unknown>>;
/** Direct Subsonic stream URL — the player can queue these http(s) URLs. */
export declare function streamUrl(creds: NavidromeCreds, songId: string): string;
/**
 * Create a playlist named `name` containing the given song ids. Each track is
 * added independently — one failing track (e.g. a stale id) doesn't abort the
 * rest. Returns the new id plus how many tracks were actually added.
 */
export declare function exportQueue(token: string, name: string, songIds: string[]): Promise<{
    id: string;
    added: number;
    failed: number;
}>;
export declare const entryToItem: (e: PlaylistEntry) => QueueItem;
