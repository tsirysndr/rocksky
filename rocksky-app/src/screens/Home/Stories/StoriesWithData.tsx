import { useNowPlayingsQuery } from "@/src/hooks/useNowPlaying";
import Stories from "./Stories";

const StoriesWithData = () => {
  const { data } = useNowPlayingsQuery(20);
  return <Stories nowPlayings={data} />;
};

export default StoriesWithData;
