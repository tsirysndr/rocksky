import Album from "@/src/components/Album";
import { FC } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";

export type TopAlbumsProps = {
  albums: {
    id: string;
    artist: string;
    title: string;
    image: string;
    uri: string;
  }[];
  onSeeAll: () => void;
  onPressAlbum: (did: string) => void;
  withoutSeeAll?: boolean;
  withoutTitle?: boolean;
};

const TopAlbums: FC<TopAlbumsProps> = (props) => {
  const { albums, onSeeAll, onPressAlbum, withoutSeeAll, withoutTitle } = props;
  const layout = useWindowDimensions();
  return (
    <View className="w-full">
      <View
        className={`flex flex-row items-center justify-between ${withoutTitle ? "" : "mt-[30px]"}`}
      >
        {!withoutTitle && (
          <Text className="font-rockford-regular text-white text-[18px]">
            Top Albums
          </Text>
        )}
        {!withoutSeeAll && (
          <Pressable onPress={onSeeAll}>
            <Text className="font-rockford-regular text-[#A0A0A0] text-[14px]">
              See all
            </Text>
          </Pressable>
        )}
      </View>
      <View
        className={`flex flex-row flex-wrap gap-x-4 auto-rows-auto ${withoutTitle ? "mt-[0px]" : "mt-[10px]"}`}
      >
        {albums.map((album) => (
          <Album
            key={album.id}
            size={layout.width / 3 - 20}
            artist={album.artist}
            title={album.title}
            image={album.image}
            onPress={onPressAlbum}
            did={album.uri}
          />
        ))}
      </View>
    </View>
  );
};

export default TopAlbums;
