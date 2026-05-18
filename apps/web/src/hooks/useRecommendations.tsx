import { useQuery } from "@tanstack/react-query";
import {
  getAlbumRecommendations,
  getArtistRecommendations,
  getTrackRecommendations,
} from "../api/recommendations";

export const useTrackRecommendationsQuery = (did: string | undefined) =>
  useQuery({
    queryKey: ["trackRecommendations", did],
    queryFn: () => getTrackRecommendations(did!),
    enabled: !!did,
    staleTime: 5 * 60 * 1000,
  });

export const useArtistRecommendationsQuery = (did: string | undefined) =>
  useQuery({
    queryKey: ["artistRecommendations", did],
    queryFn: () => getArtistRecommendations(did!),
    enabled: !!did,
    staleTime: 5 * 60 * 1000,
  });

export const useAlbumRecommendationsQuery = (did: string | undefined) =>
  useQuery({
    queryKey: ["albumRecommendations", did],
    queryFn: () => getAlbumRecommendations(did!),
    enabled: !!did,
    staleTime: 5 * 60 * 1000,
  });
