import { useMutation } from "@tanstack/react-query";
import { search } from "../api/Search.gen";

export const useSearchMutation = () =>
  useMutation({
    mutationFn: (query: string) => search(query),
  });
