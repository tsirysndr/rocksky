import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  useNavidromeAlbumsQuery,
  useNavidromeCredentials,
} from "../hooks/useNavidrome";
import CoverFlow from "../pages/library/CoverFlow";

/** One app-wide overlay, shared by the shortcut and the library button. */
export default function GlobalCoverFlow() {
  const navigate = useNavigate();
  const credentials = useNavidromeCredentials();
  const query = useNavidromeAlbumsQuery();
  const albums = useMemo(() => {
    const seen = new Set<string>();
    return (query.data?.pages.flat() ?? []).filter((album) => {
      if (seen.has(album.id)) return false;
      seen.add(album.id);
      return true;
    });
  }, [query.data]);

  return (
    <CoverFlow
      albums={albums}
      loading={credentials.isLoading || query.isLoading}
      failed={credentials.isError || query.isError}
      hasMore={query.hasNextPage}
      fetchingMore={query.isFetchingNextPage}
      loadMore={query.fetchNextPage}
      retry={() =>
        credentials.isError ? credentials.refetch() : query.refetch()
      }
      onSelect={(id) => navigate({ to: "/library/album/$id", params: { id } })}
    />
  );
}
