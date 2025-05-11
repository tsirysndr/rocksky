import { FC } from "react";
import {
  Image,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

export type StoryProps = {
  handle: string;
  avatar: string;
  title: string;
  artist: string;
  albumArt: string;
  albumUri: string;
  artistUri: string;
  trackUri: string;
  onOpenBlueskyProfile: (didOrHandle: string) => void;
  onPressAlbum: (albumDid: string) => void;
  onPressArtist: (artistDid: string) => void;
  onPressTrack: (trackDid: string) => void;
};

const Story: FC<StoryProps> = (props) => {
  const {
    handle,
    avatar,
    title,
    artist,
    albumArt,
    albumUri,
    artistUri,
    trackUri,
    onOpenBlueskyProfile,
    onPressAlbum,
    onPressArtist,
    onPressTrack,
  } = props;
  const layout = useWindowDimensions();
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
      <View className="flex-1 justify-center items-center">
        <View>
          <Pressable onPress={() => onPressAlbum(albumUri)}>
            <Image
              source={{
                uri: albumArt,
              }}
              style={{
                width: Math.min(layout.width - 40, 350),
                height: Math.min(layout.width - 40, 350),
              }}
            />
          </Pressable>
          <Pressable onPress={() => onPressTrack(trackUri)}>
            <Text className="font-rockford-regular text-white text-[16px] mt-[10px] text-center  ml-[15px] mr-[15px]">
              {title}
            </Text>
          </Pressable>
          <Pressable onPress={() => onPressArtist(artistUri)}>
            <Text className="font-rockford-regular text-[#A0A0A0] text-[14px] mt-[5px] text-center ml-[15px] mr-[15px]">
              {artist}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
};

export default Story;
