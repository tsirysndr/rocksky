import { FC } from "react";
import { Image, Pressable, Text, View } from "react-native";

export type AlbumProps = {
  row?: boolean;
  size?: number;
  artist: string;
  title: string;
  image: string;
  did: string;
  className?: string;
  onPress: (did: string) => void;
};

const Album: FC<AlbumProps> = (props) => {
  const { row, size, artist, title, image, className, did, onPress } = props;
  const imageSize = size ? size : 120;
  const direction = row ? "flex-row" : "flex-col";
  return (
    <Pressable onPress={() => onPress(did)}>
      <View className={`flex ${direction} justify-center ${className}`}>
        <Image
          source={{
            uri: image,
          }}
          className={`${row ? "mr-[15px]" : ""}`}
          style={{
            width: imageSize,
            height: imageSize,
          }}
        />
        <View
          className={` ${row ? "flex-1 justify-center" : "mt-[12px]"} max-h-[80px]`}
          style={{
            width: !row ? imageSize : undefined,
            height: !row ? imageSize : undefined,
          }}
        >
          <Text
            className="font-rockford-regular text-white"
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {title}
          </Text>
          <Text
            className="font-rockford-regular text-[#A0A0A0] mt-[2px]"
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {artist}
          </Text>
        </View>
      </View>
    </Pressable>
  );
};

export default Album;
