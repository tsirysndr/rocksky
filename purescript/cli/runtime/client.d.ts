export declare const ROCKSKY_API_URL = "https://api.rocksky.app";
interface ActorRangeOpts {
    skip?: number;
    limit?: number;
    startDate?: string;
    endDate?: string;
}
export declare class RockskyClient {
    private readonly token?;
    constructor(token?: string);
    getCurrentUser(): unknown;
    getSpotifyNowPlaying(did?: string): unknown;
    getNowPlaying(did?: string): unknown;
    scrobbles(did?: string, { skip, limit }?: {
        skip?: number;
        limit?: number;
    }): unknown;
    search(query: string, { size }: {
        size: any;
    }): unknown;
    stats(did?: string): unknown;
    getArtists(did?: string, { skip, limit }?: {
        skip?: number;
        limit?: number;
    }): unknown;
    getAlbums(did?: string, { skip, limit }?: {
        skip?: number;
        limit?: number;
    }): unknown;
    getTracks(did?: string, { skip, limit }?: {
        skip?: number;
        limit?: number;
    }): unknown;
    scrobble(api_key: any, api_sig: any, track: any, artist: any, timestamp: any): unknown;
    getApiKeys(): unknown;
    createApiKey(name: string, description?: string): unknown;
    getUploads({ skip, limit, albumUri, albumArtist, albumName, q, }?: {
        skip?: number;
        limit?: number;
        albumUri?: string;
        albumArtist?: string;
        albumName?: string;
        q?: string;
    }): unknown;
    deleteUploadByTrack(trackId: string): unknown;
    deleteUploadAlbum(params: {
        albumUri?: string;
        albumArtist?: string;
        albumName?: string;
    }): unknown;
    getUploadAlbums({ skip, limit }?: {
        skip?: number;
        limit?: number;
    }): unknown;
    getUploadArtists({ skip, limit }?: {
        skip?: number;
        limit?: number;
    }): unknown;
    getStreamToken(): Promise<{
        token: string;
        expiresIn: number;
    }>;
    streamUrl(uploadId: string, streamToken: string): string;
    scrobbleNowPlaying(track: {
        title: string;
        artist: string;
        album: string;
        albumArtist: string;
        duration: number;
        albumArt?: string;
        timestamp?: number;
    }): unknown;
    private xrpc;
    getGlobalScrobbles({ skip, limit }?: {
        skip?: number;
        limit?: number;
    }): unknown;
    getActorScrobbles(did: string, { skip, limit }?: {
        skip?: number;
        limit?: number;
    }): unknown;
    getActorSongs(did: string, { skip, limit, startDate, endDate }?: ActorRangeOpts): unknown;
    getStats(did: string): unknown;
    private xrpcPost;
    likeSong(uri: string): unknown;
    dislikeSong(uri: string): unknown;
    getLovedSongs(did: string, { skip, limit }?: {
        skip?: number;
        limit?: number;
    }): unknown;
    getActorArtists(did: string, { skip, limit, startDate, endDate }?: ActorRangeOpts): unknown;
    getActorAlbums(did: string, { skip, limit, startDate, endDate }?: ActorRangeOpts): unknown;
    matchSong(title: string, artist: string, album?: string): unknown;
}
export {};
