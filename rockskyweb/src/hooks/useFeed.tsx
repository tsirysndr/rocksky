import useSWR from "swr";
import { API_URL } from "../consts";

function useFeed() {
  const fetcher = (path: string) =>
    fetch(`${API_URL}${path}`, {
      method: "GET",
    }).then((res) => res.json());

  const { data } = useSWR("/public/scrobbles?size=105", fetcher);
  const getFeed = () => {
    return data || [];
  };

  const getFeedById = (id: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return data.find((song: any) => song.sha256 === id);
  };

  return {
    getFeed,
    getFeedById,
  };
}

export default useFeed;
