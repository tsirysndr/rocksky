import useSWR from "swr";
import { API_URL } from "../consts";

function useFeed() {
  const fetcher = (path: string) =>
    fetch(`${API_URL}${path}`, {
      method: "GET",
    }).then((res) => res.json());

  const { data, error, isLoading } = useSWR(
    "/public/scrobbles?size=100",
    fetcher
  );
  const getFeed = () => {
    return data || [];
  };

  const getFeedById = (id: string) => {
    return data.find((song) => song.sha256 === id);
  };

  return {
    getFeed,
    getFeedById,
  };
}

export default useFeed;
