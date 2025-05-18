import Song from "@/src/components/Song";
import numeral from "numeral";
import { FC } from "react";
import { Text, View } from "react-native";

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
  total: number;
  onPressTrack: (did: string) => void;
  onPressAlbum: (albumDid: string) => void;
};

const LovedTracks: FC<LovedTracksProps> = (props) => {
  const { className, tracks, total, onPressTrack, onPressAlbum } = props;
  return (
    <View className={`w-full ${className}`}>
      <Text className="font-rockford-regular text-[#A0A0A0] text-[14px] mt-[10px] ">
        LOVED TRACKS
      </Text>
      <Text className="font-rockford-regular text-white text-[18px]">
        {numeral(total).format("0,0")}
      </Text>
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
