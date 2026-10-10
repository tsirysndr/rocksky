import type { InfiniteData, QueryClient, QueryKey } from "@tanstack/react-query";
import type { LibraryPage } from "../api/remoteLibraries";

/** Refresh local artwork independently of the infinite query's network fetch. */
export async function refreshRemoteArtwork(
  cache: QueryClient,
  queryKey: QueryKey,
  sourceId: string,
  read: (sourceId: string, page: LibraryPage, resume: boolean) => Promise<LibraryPage>,
  cancelled: () => boolean,
) {
  const snapshot = cache.getQueryData<InfiniteData<LibraryPage, number>>(queryKey);
  if (!snapshot) return;
  const replacements = new Map<LibraryPage, LibraryPage>();
  for (const page of snapshot.pages) {
    if (cancelled()) return;
    replacements.set(page, await read(sourceId, page, replacements.size === 0));
  }
  // A pending network fetch owns its snapshot; let it finish before applying
  // artwork so its response cannot immediately overwrite fresh cached covers.
  if (cancelled() || cache.getQueryState(queryKey)?.fetchStatus === "fetching") return;
  cache.setQueryData<InfiniteData<LibraryPage, number>>(queryKey, (current) =>
    current ? {
      ...current,
      pages: current.pages.map((page) => replacements.get(page) ?? page),
    } : current,
  );
}
