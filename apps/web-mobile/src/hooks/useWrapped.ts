import { useQuery } from "@tanstack/react-query";
import { getWrapped } from "../api/wrapped";

export const useWrappedQuery = (did: string | undefined, year: number) =>
  useQuery({
    queryKey: ["wrapped", did, year],
    queryFn: () => getWrapped(did!, year),
    enabled: !!did,
    staleTime: 30 * 60 * 1000,
  });
