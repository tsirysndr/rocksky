import { QueryClient } from "@tanstack/react-query";

// Shared cache for the TUI. Data is cached for a minute and kept for five, so
// switching tabs / reopening panels is instant and avoids refetching.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
