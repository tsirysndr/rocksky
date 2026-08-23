import { useQuery } from "@tanstack/react-query";
import { rocksky } from "../lib/rocksky";

const chartFetcher = (opts: {
  songuri?: string;
  artisturi?: string;
  albumuri?: string;
  did?: string;
}) =>
  rocksky()
    .scrobblesChart(opts)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .then((data) => data as any)
    .catch(() => []);

export const useSongChartQuery = (uri: string) =>
  useQuery({
    queryKey: ["chart", "song", uri],
    queryFn: () => chartFetcher({ songuri: uri }),
    enabled: !!uri,
  });

export const useArtistChartQuery = (uri: string) =>
  useQuery({
    queryKey: ["chart", "artist", uri],
    queryFn: () => chartFetcher({ artisturi: uri }),
    enabled: !!uri,
  });

export const useAlbumChartQuery = (uri: string) =>
  useQuery({
    queryKey: ["chart", "album", uri],
    queryFn: () => chartFetcher({ albumuri: uri }),
    enabled: !!uri,
  });

export const useProfileChartQuery = (did: string) =>
  useQuery({
    queryKey: ["chart", "profile", did],
    queryFn: () => chartFetcher({ did }),
    enabled: !!did,
  });
