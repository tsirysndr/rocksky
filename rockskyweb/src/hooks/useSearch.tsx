import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { search } from "../api/search";
import { API_URL } from "../consts";

export const useSearchMutation = () =>
  useMutation({
    mutationFn: (query: string) => search(query),
  });

function useSearch() {
  const search = async (query: string) => {
    const response = await axios.get(`${API_URL}/search?q=${query}&size=100`);
    return response.data;
  };

  return { search };
}

export default useSearch;
