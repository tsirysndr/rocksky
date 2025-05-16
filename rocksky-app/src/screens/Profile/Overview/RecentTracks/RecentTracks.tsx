import Song from "@/src/components/Song";
import { FC } from "react";
import { Pressable, Text, View } from "react-native";

export type RecentTracksProps = {
  tracks: {
    title: string;
    artist: string;
    image: string;
    listeningDate: string;
    uri: string;
    albumUri: string;
  }[];
  onSeeAll: () => void;
  onPressTrack: (did: string) => void;
  onPressAlbum: (albumDid: string) => void;
};

const RecentTracks: FC<RecentTracksProps> = (props) => {
  const { tracks, onSeeAll, onPressTrack, onPressAlbum } = props;
  return (
    <View className="w-full">
      <View className="flex flex-row items-center justify-between mt-[30px]">
        <Text className="font-rockford-regular text-white text-[18px]">
          Recent Tracks
        </Text>
        <Pressable onPress={onSeeAll}>
          <Text className="font-rockford-regular text-[#A0A0A0] text-[14px]">
            See all
          </Text>
        </Pressable>
      </View>
      <View className="mt-[10px]">
        {tracks.map((song, index) => (
          <Song
            key={index}
            image={song.image}
            title={song.title}
            artist={song.artist}
            size={60}
            className="mt-[10px]"
            listeningDate={song.listeningDate}
            onPress={onPressTrack}
            onPressAlbum={onPressAlbum}
            did={song.uri}
            albumUri={song.albumUri}
          />
        ))}
      </View>
    </View>
  );
};

export default RecentTracks;
