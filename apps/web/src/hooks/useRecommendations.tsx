import { useQuery } from "@tanstack/react-query";
import {
  getAlbumRecommendations,
  getArtistRecommendations,
  getTrackRecommendations,
} from "../api/Recommendations.gen";

export const useTrackRecommendationsQuery = (did: string | undefined) =>
  useQuery({
    queryKey: ["trackRecommendations", did],
    queryFn: () => getTrackRecommendations(did!, undefined),
    enabled: !!did,
    staleTime: 5 * 60 * 1000,
  });

export const useArtistRecommendationsQuery = (did: string | undefined) =>
  useQuery({
    queryKey: ["artistRecommendations", did],
    queryFn: () => getArtistRecommendations(did!, undefined),
    enabled: !!did,
    staleTime: 5 * 60 * 1000,
  });

export const useAlbumRecommendationsQuery = (did: string | undefined) =>
  useQuery({
    queryKey: ["albumRecommendations", did],
    queryFn: () => getAlbumRecommendations(did!, undefined),
    enabled: !!did,
    staleTime: 5 * 60 * 1000,
  });
