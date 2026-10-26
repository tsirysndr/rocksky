export declare const AUDIO_EXTS: any;
export interface UploadResult {
    uploadId: string;
    trackId: string;
    track: {
        title: string;
        artist: string;
        album: string;
        duration: number;
        genre: string | null;
    };
}
/**
 * Expand the given paths into a flat list of audio files, walking directories
 * recursively.
 */
export declare function collectAudioFiles(paths: string[]): string[];
/**
 * Upload one audio file to Rocksky, reporting 0–100 progress. Resolves with the
 * created upload; rejects with an AxiosError whose `response.data` holds the
 * server's `{ error, message }` on validation failures (400/409/422).
 */
export declare function uploadTrack(token: string, filePath: string, onProgress: (percent: number) => void, 
/** BYO storage provider to upload into; omitted = Rocksky managed storage. */
storageProviderId?: string): Promise<UploadResult>;
export interface StorageProvider {
    id: string;
    label: string;
    endpoint: string;
    bucket: string;
}
/**
 * Resolve a `--storage` ref to a provider id. Matches the provider's label,
 * bucket or id, case-insensitively; a miss or an ambiguous match throws with
 * the available providers listed, which is also how a user discovers them.
 */
export declare function resolveStorageProvider(token: string, ref: string): Promise<StorageProvider>;
