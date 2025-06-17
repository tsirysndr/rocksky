import Song from "@/src/components/Song";
import { FC } from "react";
import { Pressable, Text, View } from "react-native";

export type TopTracksProps = {
  className?: string;
  onSeeAll: () => void;
  tracks: {
    id: string;
    title: string;
    artist: string;
    image: string;
    uri: string;
    albumUri: string;
  }[];
  onPressTrack: (did: string) => void;
  onPressAlbum: (albumDid: string) => void;
};

const TopTracks: FC<TopTracksProps> = (props) => {
  const { className, tracks, onSeeAll, onPressTrack, onPressAlbum } = props;
  return (
    <View className={`w-full ${className}`}>
      <View className="flex flex-row items-center justify-between mt-[30px]">
        <Text className="font-rockford-regular text-white text-[18px]">
          Top Tracks
        </Text>
        <Pressable onPress={onSeeAll}>
          <Text className="font-rockford-regular text-[#A0A0A0] text-[14px]">
            See all
          </Text>
        </Pressable>
      </View>
      <View className="mb-[100px] mt-[10px]">
        {tracks.map((song, index) => (
          <Song
            key={song.id}
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

export default TopTracks;
