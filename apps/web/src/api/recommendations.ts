import { client } from ".";

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

export const getTrackRecommendations = (did: string, limit = 50) =>
  client
    .get<{ recommendations: TrackRecommendation[] }>(
      "/xrpc/app.rocksky.feed.getRecommendations",
      {
        params: { did, limit },
        headers: {
          Authorization: localStorage.getItem("token")
            ? `Bearer ${localStorage.getItem("token")}`
            : undefined,
        },
      },
    )
    .then((r) => r.data.recommendations ?? []);

export const getArtistRecommendations = (did: string, limit = 50) =>
  client
    .get<{ artists: ArtistRecommendation[] }>(
      "/xrpc/app.rocksky.feed.getArtistRecommendations",
      {
        params: { did, limit },
        headers: {
          Authorization: localStorage.getItem("token")
            ? `Bearer ${localStorage.getItem("token")}`
            : undefined,
        },
      },
    )
    .then((r) => r.data.artists ?? []);

export const getAlbumRecommendations = (did: string, limit = 50) =>
  client
    .get<{ albums: AlbumRecommendation[] }>(
      "/xrpc/app.rocksky.feed.getAlbumRecommendations",
      {
        params: { did, limit },
        headers: {
          Authorization: localStorage.getItem("token")
            ? `Bearer ${localStorage.getItem("token")}`
            : undefined,
        },
      },
    )
    .then((r) => r.data.albums ?? []);
