import { NowPlayings } from "@/src/hooks/useNowPlaying";
import { Image as ExpoImage } from "expo-image";
import { FC } from "react";
import {
  Image,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import PagerView from "react-native-pager-view";

export type StoryProps = {
  stories: NowPlayings;
  index?: number;
  onOpenProfile: (didOrHandle: string) => void;
  onPressAlbum: (albumDid: string) => void;
  onPressArtist: (artistDid: string) => void;
  onPressTrack: (trackDid: string) => void;
};

const Story: FC<StoryProps> = (props) => {
  const {
    stories,
    onOpenProfile,
    onPressAlbum,
    onPressArtist,
    onPressTrack,
    index,
  } = props;
  const layout = useWindowDimensions();
  return (
    <PagerView
      className="bg-black"
      initialPage={index || 0}
      style={{ flex: 1, marginTop: 50 }}
    >
      {stories.map((story, index) => {
        return (
          <View key={index + 1}>
            <Pressable onPress={() => onOpenProfile(story.handle)}>
              <View className="flex flex-row items-center justify-start">
                <Image
                  className="w-[40px] h-[40px] rounded-full mr-[15px]"
                  source={{
                    uri: story.avatar,
                  }}
                />
                <Text className="font-rockford-regular text-[#fff]">
                  {story.handle}
                </Text>
                <Text className="font-rockford-regular text-[#A0A0A0] ml-[5px]">
                  {story.created_at}
                </Text>
              </View>
            </Pressable>
            <View className="flex-1 justify-center items-center">
              <View className="flex-1 justify-center items-center">
                <Pressable onPress={() => onPressAlbum(story.album_uri!)}>
                  <ExpoImage
                    source={{
                      uri: story.album_art,
                    }}
                    style={{
                      width: Math.min(layout.width - 40, 350),
                      height: Math.min(layout.width - 40, 350),
                    }}
                  />
                </Pressable>
                <Pressable onPress={() => onPressTrack(story.track_uri)}>
                  <Text className="font-rockford-regular text-white text-[16px] mt-[10px] text-center  ml-[15px] mr-[15px]">
                    {story.title}
                  </Text>
                </Pressable>
                <Pressable onPress={() => onPressArtist(story.artist_uri!)}>
                  <Text className="font-rockford-regular text-[#A0A0A0] text-[14px] mt-[5px] text-center ml-[15px] mr-[15px]">
                    {story.artist}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        );
      })}
    </PagerView>
  );
};

export default Story;
