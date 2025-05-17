import Song from "@/src/components/Song";
import { FC } from "react";
import { View } from "react-native";

export type LovedTracksProps = {
  className?: string;
  onSeeAll: () => void;
  tracks: {
    title: string;
    artist: string;
    image: string;
    uri: string;
    albumUri: string;
  }[];
  onPressTrack: (did: string) => void;
  onPressAlbum: (albumDid: string) => void;
};

const LovedTracks: FC<LovedTracksProps> = (props) => {
  const { className, tracks, onSeeAll, onPressTrack, onPressAlbum } = props;
  return (
    <View className={`w-full ${className}`}>
      <View className="mb-[100px] mt-[10px]">
        {tracks.map((song, index) => (
          <Song
            key={index}
            rank={index + 1}
            image={song.image}
            title={song.title}
            artist={song.artist}
            size={60}
            className="mt-[10px]"
            onPress={() => onPressTrack(song.uri)}
            onPressAlbum={() => onPressAlbum(song.albumUri)}
            did=""
            albumUri={song.albumUri}
          />
        ))}
      </View>
    </View>
  );
};

export default LovedTracks;
