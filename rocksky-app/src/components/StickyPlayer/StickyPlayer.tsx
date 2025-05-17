import FontAwesome5 from "@expo/vector-icons/FontAwesome5";
import Ionicons from "@expo/vector-icons/Ionicons";
import { FC } from "react";
import { Image, Pressable, Text, View } from "react-native";
import Progressbar from "../Progressbar";

export type StickyPlayerProps = {
  onPlay: () => void;
  onPause: () => void;
  onLike: (songUri: string) => void;
  onDislike: (songUri: string) => void;
  isPlaying: boolean;
  liked: boolean;
  progress?: number;
  song?: {
    title: string;
    artist: string;
    cover: string;
    uri: string;
  };
  className?: string;
};

const StickyPlayer: FC<StickyPlayerProps> = (props) => {
  const { onPlay, onPause, isPlaying, song, progress, className, liked } =
    props;
  return (
    <>
      {song && (
        <>
          <View
            className={`flex-row items-center ml-[8px] mr-[8px] ${className}`}
          >
            <Image
              source={{
                uri: song.cover,
              }}
              className="w-[50px] h-[50px] mr-[15px] mt-[6px]"
            />
            <View className="flex-1">
              <Text
                className="font-rockford-regular text-white"
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {song.title}
              </Text>
              <Text
                className="font-rockford-regular text-[#A0A0A0] mt-[2px]"
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {song.artist}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                if (liked) {
                  props.onDislike(song.uri);
                  return;
                }
                props.onLike(song.uri);
              }}
            >
              <View className="w-[36px] items-center">
                {!liked && (
                  <Ionicons name="heart-outline" size={23} color="white" />
                )}
                {liked && (
                  <Ionicons name="heart-sharp" size={23} color="#ff2876" />
                )}
              </View>
            </Pressable>
            <Pressable onPress={isPlaying ? onPause : onPlay}>
              <View className="w-[40px] items-center">
                {isPlaying && (
                  <FontAwesome5 name="pause" size={18} color="white" />
                )}
                {!isPlaying && (
                  <FontAwesome5 name="play" size={18} color="white" />
                )}
              </View>
            </Pressable>
          </View>
          <View className="ml-[8px] mr-[8px]">
            <Progressbar progress={progress || 0} className="mt-[5px]" />
          </View>
        </>
      )}
    </>
  );
};

export default StickyPlayer;
