import { useNowPlaying } from "@/src/hooks/useNowPlaying";
import StickyPlayer from "./StickyPlayer";

const StickyPlayerWithData = () => {
  const did = "did:plc:7vdlgi2bflelz7mmuxoqjfcr";
  const { nowPlaying, isLoading, progress } = useNowPlaying(did);
  return (
    <>
      {nowPlaying && !isLoading && (
        <StickyPlayer
          isPlaying={true}
          onPlay={() => {}}
          onPause={() => {}}
          progress={Math.floor((progress / nowPlaying.duration) * 100)}
          song={{
            title: nowPlaying.title,
            artist: nowPlaying.artist,
            cover: nowPlaying?.cover,
          }}
        />
      )}
    </>
  );
};

export default StickyPlayerWithData;
