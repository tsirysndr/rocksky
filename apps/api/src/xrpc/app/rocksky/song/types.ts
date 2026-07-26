export interface SearchResponse {
  tracks: Tracks;
}

export interface Tracks {
  href: string;
  limit: number;
  next: string | null;
  offset: number;
  previous: string | null;
  total: number;
  items: Track[];
}

export interface Track {
  album: Album;
  artists: Artist[];
  available_markets: string[];
  disc_number: number;
  duration_ms: number;
  explicit: boolean;
  external_ids: ExternalIds;
  external_urls: ExternalUrls;
  href: string;
  id: string;
  is_local: boolean;
  is_playable?: boolean;
  name: string;
  popularity: number;
  preview_url: string | null;
  track_number: number;
  type: string;
  uri: string;
}

export interface Album {
  album_type: string;
  artists: Artist[];
  available_markets: string[];
  external_urls: ExternalUrls;
  href: string;
  id: string;
  images: Image[];
  name: string;
  release_date: string;
  release_date_precision: string;
  total_tracks: number;
  type: string;
  uri: string;
  label?: string;
  genres?: string[];
  copyrights?: Copyright[];
}

export interface Copyright {
  text: string;
  type: string;
}

export interface Artist {
  external_urls: ExternalUrls;
  href: string;
  id: string;
  name: string;
  type: string;
  uri: string;
  images?: Image[];
  genres?: string[];
}

export interface ExternalUrls {
  spotify: string;
}

export interface ExternalIds {
  isrc: string;
}

export interface Image {
  height: number;
  width: number;
  url: string;
}

export interface AccessToken {
  access_token: string;
  token_type: string;
  scope: string;
  expires_in: number;
}

export interface MusicBrainzArtist {
  mbid: string;
  name: string;
}

// Mirrors the response of the Deezer enrichment service (deezer/ Go service,
// POST /enrich). Durations are already normalized to milliseconds.
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
