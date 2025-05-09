import { FC } from "react";
import { Image, Text, View } from "react-native";

export type ArtistProps = {
  row?: boolean;
  size?: number;
  name: string;
  image: string;
};

const Artist: FC<ArtistProps> = (props) => {
  const { row, size, name, image } = props;
  const imageSize = size ? size : 80;
  const direction = row ? "flex-row" : "flex-col";
  return (
    <View className={`flex ${direction} items-center justify-center`}>
      <Image
        source={{
          uri: image,
        }}
        className={`w-[${imageSize}px] h-[${imageSize}px] rounded-full`}
      />
      <Text
        className={`font-rockford-regular text-white mt-[10px] ${row ? "ml-[15px]" : ""}`}
      >
        {name}
      </Text>
    </View>
  );
};

export default Artist;
