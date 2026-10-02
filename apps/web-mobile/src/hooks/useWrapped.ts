import { useQuery } from "@tanstack/react-query";
import { getWrapped, type WrappedPeriod } from "../api/wrapped";

export const useWrappedQuery = (
  did: string | undefined,
  year: number,
  period: WrappedPeriod = "year",
) =>
  useQuery({
    queryKey: ["wrapped", did, period, period === "year" ? year : null],
    queryFn: () => getWrapped(did!, year, period),
    enabled: !!did,
    staleTime: 30 * 60 * 1000,
  });
