import Progressbar from "@/src/components/Progressbar";
import { NowPlayings } from "@/src/hooks/useNowPlaying";
import { Image as ExpoImage } from "expo-image";
import { FC, useEffect, useRef, useState } from "react";
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
  onAllStoriesEnd?: () => void;
};

const STORY_DURATION = 10000;

const Story: FC<StoryProps> = (props) => {
  const {
    stories,
    onOpenProfile,
    onPressAlbum,
    onPressArtist,
    onPressTrack,
    index,
    onAllStoriesEnd,
  } = props;
  const layout = useWindowDimensions();
  const [progress, setProgress] = useState(0);
  const animationFrame = useRef<number | null>(null);
  const pagerRef = useRef<PagerView>(null);
  const [currentIndex, setCurrentIndex] = useState(index || 0);

  useEffect(() => {
    let start: number | null = null;

    const animate = (timestamp: number) => {
      if (!start) start = timestamp;
      const elapsed = timestamp - start;
      const percent = Math.min((elapsed / STORY_DURATION) * 100, 100);
      setProgress(percent);

      if (percent < 100) {
        animationFrame.current = requestAnimationFrame(animate);
      } else {
        if (currentIndex < stories.length - 1) {
          setCurrentIndex((prev) => prev + 1);
          pagerRef.current?.setPage(currentIndex + 1);
        } else if (onAllStoriesEnd) {
          onAllStoriesEnd();
        } else {
          setProgress(0);
        }
      }
    };

    setProgress(0);
    if (animationFrame.current) {
      cancelAnimationFrame(animationFrame.current);
    }
    animationFrame.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrame.current) {
        cancelAnimationFrame(animationFrame.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, stories.length]);

  return (
    <PagerView
      ref={pagerRef}
      className="bg-black"
      initialPage={index || 0}
      style={{ flex: 1, marginTop: 50 }}
      onPageSelected={(e) => {
        setCurrentIndex(e.nativeEvent.position);
      }}
      scrollEnabled={true}
    >
      {stories.map((story, idx) => (
        <View key={idx + 1}>
          <View className="mb-[10px]">
            <Progressbar
              color="rgba(255, 255, 255, 0.76)"
              progress={
                idx === currentIndex ? progress : idx < currentIndex ? 100 : 0
              }
            />
          </View>
          <Pressable onPress={() => onOpenProfile(story.handle)}>
            <View className="flex flex-row items-center justify-start">
              <Image
                className="w-[40px] h-[40px] rounded-full mr-[15px]"
                source={{
                  uri: story.avatar,
                }}
              />
              <Text className="font-rockford-regular text-[#fff]">
                @{story.handle}
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
                <Text className="font-rockford-regular text-white text-[16px] mt-[10px] text-center ml-[15px] mr-[15px]">
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
      ))}
    </PagerView>
  );
};

export default Story;
