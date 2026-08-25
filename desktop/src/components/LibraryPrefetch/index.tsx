import { useEffect, useState } from "react";
import {
  useNavidromeAlbumsQuery,
  useNavidromeArtistsQuery,
  useNavidromePlaylistsQuery,
  useNavidromeTracksQuery,
} from "../../hooks/useNavidrome";

/**
 * Warms the library tabs in the background so opening /library reads from the
 * React Query cache instead of waiting on four round trips.
 *
 * It calls the page's own hooks rather than prefetching by hand — that way the
 * keys and fetchers can't drift apart from what the page subscribes to. They
 * stay idle until useNavidromeCredentials resolves, which only happens for a
 * signed-in user.
 */
function PrefetchQueries() {
  useNavidromeTracksQuery();
  useNavidromeAlbumsQuery();
  useNavidromeArtistsQuery();
  useNavidromePlaylistsQuery();
  return null;
}

function LibraryPrefetch() {
  // Held back so the whole library doesn't compete with the page the user is
  // actually looking at.
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setArmed(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  return armed ? <PrefetchQueries /> : null;
}

export default LibraryPrefetch;
