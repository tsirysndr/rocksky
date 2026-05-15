import { useQuery } from "@tanstack/react-query";
import { getScrobbleByUri } from "../api/feed";

export const useScrobbleByUriQuery = (uri: string) =>
  useQuery({
    queryKey: ["scrobble", uri],
    queryFn: () => getScrobbleByUri(uri),
    enabled: !!uri,
  });
