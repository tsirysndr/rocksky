import Artist from "@/src/components/Artist";
import { FC } from "react";
import { Pressable, Text, View } from "react-native";

export type TopArtistsProps = {
  className?: string;
  artists: {
    rank: number;
    name: string;
    image: string;
  }[];
  onSeeAll: () => void;
  onPressArtist: (did: string) => void;
};

const TopArtists: FC<TopArtistsProps> = (props) => {
  const { className, artists, onSeeAll, onPressArtist } = props;
  return (
    <View className="w-full">
      <View
        className={`flex flex-row items-center justify-between mt-[30px] ${className}`}
      >
        <Text className="font-rockford-regular text-white text-[18px]">
          Top Artists
        </Text>
        <Pressable onPress={onSeeAll}>
          <Text className="font-rockford-regular text-[#A0A0A0] text-[14px]">
            See all
          </Text>
        </Pressable>
      </View>
      {artists.map((artist, index) => (
        <Artist
          row
          size={68}
          key={index}
          rank={artist.rank}
          name={artist.name}
          image={artist.image}
          className="mt-[20px]"
          did=""
          onPress={onPressArtist}
        />
      ))}
    </View>
  );
};

export default TopArtists;
