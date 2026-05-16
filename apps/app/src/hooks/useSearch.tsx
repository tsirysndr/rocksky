import { useQuery } from "@tanstack/react-query";
import { search } from "../api/search";

export const useSearchQuery = (query: string) =>
  useQuery({
    queryKey: ["search", query],
    queryFn: () => search(query),
    enabled: query.trim().length > 0,
    staleTime: 30_000,
  });
