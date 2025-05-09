import { FC } from "react";
import { Image, Text, View } from "react-native";

export type AlbumProps = {
  row?: boolean;
  size?: number;
  artist: string;
  title: string;
  image: string;
};

const Album: FC<AlbumProps> = (props) => {
  const { row, size, artist, title, image } = props;
  const imageSize = size ? size : 120;
  const direction = row ? "flex-row" : "flex-col";
  return (
    <View className="flex flex-col items-center justify-center">
      <Image
        source={{
          uri: "https://cdn.rocksky.app/covers/ec9bbc208b04182f315f8137cfb2125b.jpg",
        }}
        className="w-[120px] h-[120px]"
      />
      <Text className="font-rockford-regular text-white mt-[12px]">
        {title}
      </Text>
      <Text className="font-rockford-regular text-[#A0A0A0] mt-[2px]">
        {artist}
      </Text>
    </View>
  );
};

export default Album;
