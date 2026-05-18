import { useQuery } from "@tanstack/react-query";
import { client } from "../api";
import { storage } from "../storage";

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

const authHeaders = () => {
  const token = storage.getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const useTrackRecommendationsQuery = (did: string | undefined) =>
  useQuery({
    queryKey: ["trackRecommendations", did],
    queryFn: () =>
      client
        .get<{ recommendations: TrackRecommendation[] }>(
          "/xrpc/app.rocksky.feed.getRecommendations",
          { params: { did, limit: 50 }, headers: authHeaders() },
        )
        .then((r) => r.data.recommendations ?? []),
    enabled: !!did,
    staleTime: 5 * 60 * 1000,
  });

export const useArtistRecommendationsQuery = (did: string | undefined) =>
  useQuery({
    queryKey: ["artistRecommendations", did],
    queryFn: () =>
      client
        .get<{ artists: ArtistRecommendation[] }>(
          "/xrpc/app.rocksky.feed.getArtistRecommendations",
          { params: { did, limit: 50 }, headers: authHeaders() },
        )
        .then((r) => r.data.artists ?? []),
    enabled: !!did,
    staleTime: 5 * 60 * 1000,
  });

export const useAlbumRecommendationsQuery = (did: string | undefined) =>
  useQuery({
    queryKey: ["albumRecommendations", did],
    queryFn: () =>
      client
        .get<{ albums: AlbumRecommendation[] }>(
          "/xrpc/app.rocksky.feed.getAlbumRecommendations",
          { params: { did, limit: 50 }, headers: authHeaders() },
        )
        .then((r) => r.data.albums ?? []),
    enabled: !!did,
    staleTime: 5 * 60 * 1000,
  });
