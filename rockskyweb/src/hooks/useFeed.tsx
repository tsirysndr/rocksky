import { data } from "../pages/home/feed/mocks";

function useFeed() {
  const getFeed = () => {
    return data;
  };

  const getFeedById = (id: string) => {
    return data.find((song) => song.id === id);
  };

  return {
    getFeed,
    getFeedById,
  };
}

export default useFeed;
