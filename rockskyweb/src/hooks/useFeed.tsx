import useSWR from "swr";
import { API_URL } from "../consts";

function useFeed() {
  const fetcher = (path: string) =>
    fetch(`${API_URL}${path}`, {
      method: "GET",
    }).then((res) => res.json());

  const { data } = useSWR("/public/scrobbles?size=114", fetcher);
  const getFeed = () => {
    return data || [];
  };

  const getFeedByUri = (uri: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return data.find((song: any) => song.uri === uri);
  };

  return {
    getFeed,
    getFeedByUri,
  };
}

export default useFeed;
