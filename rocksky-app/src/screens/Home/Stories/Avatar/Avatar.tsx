import { FC } from "react";
import { Image, Pressable, Text, View } from "react-native";

export type AvatarProps = {
  name: string;
  image: string;
  size?: number;
  className?: string;
  onPress: () => void;
};

const Avatar: FC<AvatarProps> = (props) => {
  const { name, image, size, className, onPress } = props;

  return (
    <Pressable onPress={onPress}>
      <View className={`items-center ${className}`}>
        <View
          style={{
            width: (size || 72) + 9,
            height: (size || 72) + 9,
            borderColor: "#ff2876",
            borderWidth: 2,
          }}
          className="items-center justify-center rounded-full bg-black"
        >
          <Image
            source={{
              uri: image,
            }}
            className="rounded-full"
            style={{
              width: size || 72,
              height: size || 72,
            }}
          />
        </View>
        <Text
          className="font-rockford-regular text-white text-[12px] mt-[5px] text-center"
          numberOfLines={1}
          ellipsizeMode="tail"
          style={{
            width: (size || 72) + 20,
          }}
        >
          {name}
        </Text>
      </View>
    </Pressable>
  );
};

export default Avatar;
