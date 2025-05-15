import { useNowPlayingsQuery } from "@/src/hooks/useNowPlaying";
import Stories from "./Stories";

const StoriesWithData = () => {
  const { data } = useNowPlayingsQuery();
  return <Stories nowPlayings={data} />;
};

export default StoriesWithData;
