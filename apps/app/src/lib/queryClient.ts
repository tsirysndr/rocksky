import { QueryClient } from "@tanstack/react-query";

/**
 * The app's one query cache.
 *
 * It lives here rather than in App.tsx so code outside React can read through
 * it too — the playback engine is a module, not a component, and its lookups
 * should hit the same cache the screens do instead of refetching per track.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      retry: 2,
    },
  },
});
