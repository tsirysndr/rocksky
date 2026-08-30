import { rocksky } from "../lib/rocksky";

export type TrackRecommendation = {
  title?: string;
  artist?: string;
  album?: string;
  albumArt?: string;
  trackUri?: string;
  artistUri?: string;
  albumUri?: string;
  genres?: string[];
  recommendationScore?: number;
  source?: string;
  likesCount?: number;
};

export type ArtistRecommendation = {
  id?: string;
  uri?: string;
  name?: string;
  picture?: string;
  genres?: string[];
  recommendationScore?: number;
  source?: string;
};

export type AlbumRecommendation = {
  id?: string;
  uri?: string;
  title?: string;
  artist?: string;
  artistUri?: string;
  year?: number;
  albumArt?: string;
  recommendationScore?: number;
  source?: string;
};

export const getTrackRecommendations = (
  did: string,
  limit = 100,
): Promise<TrackRecommendation[]> =>
  rocksky()
    .recommendations(did, limit)
    .then((r) => (r.recommendations ?? []) as TrackRecommendation[]);

export const getArtistRecommendations = (
  did: string,
  limit = 100,
): Promise<ArtistRecommendation[]> =>
  rocksky()
    .artistRecommendations(did, limit)
    .then((r) => (r.artists ?? []) as ArtistRecommendation[]);

export const getAlbumRecommendations = (
  did: string,
  limit = 100,
): Promise<AlbumRecommendation[]> =>
  rocksky()
    .albumRecommendations(did, limit)
    .then((r) => (r.albums ?? []) as AlbumRecommendation[]);
