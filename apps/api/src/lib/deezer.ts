import type { Context } from "context";
import { consola } from "consola";

// Shared client for the Deezer enrichment service (deezer/ Go service, exposed
// on ctx.deezer / DEEZER_URL). Used as the metadata fallback across every
// enrichment pipeline (matchSong, nowplaying, status subscriber, backfill) when
// Spotify / MusicBrainz can't resolve a track. Durations are milliseconds.

export interface DeezerEnrichedTrack {
  title: string;
  artist: string;
  albumArtist?: string;
  album: string;
  albumArt?: string;
  isrc?: string;
  upc?: string;
  durationMs: number;
  trackNumber?: number;
  discNumber?: number;
  releaseDate?: string;
  year?: number;
  label?: string;
  genres?: string[];
  artistPicture?: string;
  deezerLink?: string;
  preview?: string;
  explicit?: boolean;
  deezerTrackId?: number;
  deezerAlbumId?: number;
  deezerArtistId?: number;
}

export interface DeezerMatch {
  id: number;
  title: string;
  artist: string;
  album: string;
  albumArt?: string;
  isrc?: string;
  durationMs: number;
  trackNumber?: number;
  discNumber?: number;
  link?: string;
  preview?: string;
  rank?: number;
  explicit?: boolean;
  score: number;
}

export interface DeezerEnrichResponse {
  track: DeezerEnrichedTrack | null;
  matches: DeezerMatch[];
}

/**
 * Ask the Deezer enrichment service for the best canonical track metadata plus
 * a ranked list of candidate matches. Never throws — returns `undefined` when
 * Deezer is unreachable or errors, so callers can use it as a best-effort
 * fallback without guarding every call site.
 */
export const enrichWithDeezer = async (
  ctx: Context,
  title: string,
  artist: string,
  album?: string,
): Promise<DeezerEnrichResponse | undefined> => {
  try {
    const { data } = await ctx.deezer.post<DeezerEnrichResponse>("/enrich", {
      title,
      artist,
      album,
    });
    return data;
  } catch (error) {
    consola.warn(
      "Deezer enrichment failed:",
      error instanceof Error ? error.message : error,
    );
    return undefined;
  }
};
