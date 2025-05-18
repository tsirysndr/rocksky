import { Image } from "expo-image";
import { FC } from "react";
import { Pressable, Text, View } from "react-native";
import ArtistIcon from "../Icons/Artist";

export type ArtistProps = {
  row?: boolean;
  size?: number;
  name: string;
  image?: string;
  className?: string;
  rank?: number;
  did: string;
  onPress: (did: string) => void;
};

const Artist: FC<ArtistProps> = (props) => {
  const { row, size, name, image, rank, className, did, onPress } = props;
  const imageSize = size ? size : 80;
  const direction = row ? "flex-row" : "flex-col";
  return (
    <Pressable onPress={() => onPress(did)}>
      <View
        className={`flex ${direction} items-center ${row ? "justify-start" : "justify-center"} ${className}`}
      >
        {rank && row && (
          <Text className="font-rockford-regular text-white mr-[20px]">
            {rank}
          </Text>
        )}
        {image && (
          <Image
            source={{
              uri: image,
            }}
            style={{
              width: imageSize,
              height: imageSize,
              borderRadius: imageSize / 2,
            }}
          />
        )}
        {!image && (
          <View
            style={{
              width: imageSize,
              height: imageSize,
              borderRadius: imageSize / 2,
              backgroundColor: "#a0a0a02b",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <ArtistIcon size={24} width={28} height={28} color="#a0a0a0d8" />
          </View>
        )}
        <Text
          className={`font-rockford-regular text-white  ${row ? "ml-[20px]" : "text-center mt-[10px]" + " w-[" + (imageSize + 30) + "px]"}`}
          numberOfLines={2}
          ellipsizeMode="tail"
        >
          {name}
        </Text>
      </View>
    </Pressable>
  );
};

export default Artist;
