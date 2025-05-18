import { Image } from "expo-image";
import { FC } from "react";
import { Pressable, Text, View } from "react-native";

export type AlbumProps = {
  row?: boolean;
  size?: number;
  artist: string;
  title: string;
  image: string;
  did: string;
  rank?: number;
  className?: string;
  onPress: (did: string) => void;
};

const Album: FC<AlbumProps> = (props) => {
  const { row, size, artist, title, image, className, did, rank, onPress } =
    props;
  const imageSize = size ? size : 120;
  const direction = row ? "flex-row" : "flex-col";
  return (
    <Pressable onPress={() => onPress(did)}>
      <View className={`flex ${direction} justify-center ${className}`}>
        {rank && (
          <Text className="font-rockford-medium text-[#ffffff] text-[14px] mr-[10px]">
            {rank}
          </Text>
        )}
        <Image
          source={{
            uri: image,
          }}
          style={{
            width: imageSize,
            height: imageSize,
            marginRight: row ? 15 : 0,
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
            numberOfLines={row ? 1 : 2}
            ellipsizeMode="tail"
          >
            {title}
          </Text>
          <Text
            className="font-rockford-regular text-[#A0A0A0] mt-[2px]"
            numberOfLines={row ? 1 : 2}
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
