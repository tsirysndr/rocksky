import { useMutation } from "@tanstack/react-query";
import { search } from "../api/search";
import { SearchResponse } from "../types/search";

export const useSearchMutation = () =>
  useMutation<SearchResponse, Error, string>({
    mutationFn: (query: string) => search(query),
  });
