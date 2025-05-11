import FontAwesome from "@expo/vector-icons/FontAwesome";
import { FC } from "react";
import { Image, Pressable, Text, View } from "react-native";

export type AvatarProps = {
  avatar: string;
  name: string;
  handle: string;
  did: string;
  scrobblingSince: string;
  onOpenBlueskyProfile: (didOrHandle: string) => void;
  onViewOnPdsls: (did: string) => void;
};

const Avatar: FC<AvatarProps> = (props) => {
  const {
    avatar,
    name,
    handle,
    scrobblingSince,
    did,
    onOpenBlueskyProfile,
    onViewOnPdsls,
  } = props;
  return (
    <View className="flex flex-col">
      <Image
        source={{
          uri: avatar,
        }}
        className="w-[80px] h-[80px] rounded-full mr-[15px]"
      />
      <View>
        <View className="flex flex-row items-center mt-[10px]">
          <Text className="flex-1 font-rockford-regular text-white text-[21px]">
            {name}
          </Text>
          <Pressable onPress={() => onViewOnPdsls(did)}>
            <FontAwesome name="external-link" size={18} color="white" />
          </Pressable>
        </View>

        <View className="flex flex-row items-center mt-[2px]">
          <Pressable onPress={() => props.onOpenBlueskyProfile(handle)}>
            <Text className="font-rockford-regular text-[#ff2876]">
              {handle}
            </Text>
          </Pressable>
          <Text className="font-rockford-regular text-[#A0A0A0] ml-[5px] mr-[5px] mt-[2px] ">
            •
          </Text>
          <Text className="font-rockford-regular text-[#A0A0A0] text-[12px]">
            scrobbling since {scrobblingSince}
          </Text>
        </View>
      </View>
    </View>
  );
};

export default Avatar;
