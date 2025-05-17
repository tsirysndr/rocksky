import { useNowPlayingContext } from "@/src/providers/NowPlayingProvider";
import StickyPlayer from "./StickyPlayer";

const StickyPlayerWithData = () => {
  const { nowPlaying, isLoading, progress } = useNowPlayingContext();
  return (
    <>
      {nowPlaying && !isLoading && (
        <StickyPlayer
          isPlaying={nowPlaying.isPlaying}
          liked={nowPlaying.liked}
          onPlay={() => {}}
          onPause={() => {}}
          progress={Math.floor((progress / nowPlaying.duration) * 100)}
          song={{
            title: nowPlaying.title,
            artist: nowPlaying.artist,
            cover: nowPlaying?.cover,
            uri: nowPlaying.uri,
          }}
          onLike={() => {}}
          onDislike={() => {}}
        />
      )}
    </>
  );
};

export default StickyPlayerWithData;
