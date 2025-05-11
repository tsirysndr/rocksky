import Album from "@/src/components/Album";
import { FC } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";

export type TopAlbumsProps = {
  albums: {
    artist: string;
    title: string;
    image: string;
  }[];
  onSeeAll: () => void;
  onPressAlbum: (did: string) => void;
};

const TopAlbums: FC<TopAlbumsProps> = (props) => {
  const { albums, onSeeAll, onPressAlbum } = props;
  const layout = useWindowDimensions();
  return (
    <View className="w-full">
      <View className="flex flex-row items-center justify-between mt-[30px]">
        <Text className="font-rockford-regular text-white text-[18px]">
          Top Albums
        </Text>
        <Pressable onPress={onSeeAll}>
          <Text className="font-rockford-regular text-[#A0A0A0] text-[14px]">
            See all
          </Text>
        </Pressable>
      </View>
      <View className="flex flex-row flex-wrap gap-x-4 auto-rows-auto mt-[10px]">
        {albums.map((album, index) => (
          <Album
            key={index}
            size={layout.width / 3 - 20}
            artist={album.artist}
            title={album.title}
            image={album.image}
            onPress={onPressAlbum}
            did={""}
          />
        ))}
      </View>
    </View>
  );
};

export default TopAlbums;
