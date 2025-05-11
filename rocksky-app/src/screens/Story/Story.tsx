import { FC } from "react";
import { Image, Pressable, Text, View } from "react-native";

export type StoryProps = {
  handle: string;
  avatar: string;
  onOpenBlueskyProfile: (didOrHandle: string) => void;
};

const Story: FC<StoryProps> = (props) => {
  const { handle, avatar, onOpenBlueskyProfile } = props;
  return (
    <View className="w-full h-full bg-black pt-[50px]">
      <Pressable onPress={() => onOpenBlueskyProfile(handle)}>
        <View className="flex flex-row items-center justify-start">
          <Image
            className="w-[40px] h-[40px] rounded-full mr-[15px]"
            source={{
              uri: avatar,
            }}
          />
          <Text className="font-rockford-regular text-[#fff]">{handle}</Text>
        </View>
      </Pressable>
    </View>
  );
};

export default Story;
