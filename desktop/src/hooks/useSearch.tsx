import { useMutation } from "@tanstack/react-query";
import { search } from "../api/search";

export const useSearchMutation = () =>
  useMutation({
    mutationFn: (query: string) => search(query),
  });
