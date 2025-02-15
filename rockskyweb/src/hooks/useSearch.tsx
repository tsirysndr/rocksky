import axios from "axios";
import { API_URL } from "../consts";

function useSearch() {
  const search = async (query: string) => {
    const response = await axios.get(`${API_URL}/search?q=${query}&size=100`);
    return response.data;
  };

  return { search };
}

export default useSearch;
