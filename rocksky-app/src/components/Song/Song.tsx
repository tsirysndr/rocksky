import { Image } from "expo-image";
import { FC } from "react";
import { Pressable, Text, View } from "react-native";

export type SongProps = {
  size?: number;
  artist: string;
  title: string;
  image?: string;
  listenerAvatar?: string;
  listenerHandle?: string;
  listeningDate?: string;
  className?: string;
  rank?: number;
  borderRadius?: number;
  did: string;
  albumUri: string;
  onPress: (did: string) => void;
  onPressAlbum: (albumDid: string) => void;
  onOpenProfile?: (didOrHandle: string) => void;
  withoutAlbumCover?: boolean;
};

const Song: FC<SongProps> = (props) => {
  const {
    size,
    artist,
    title,
    image,
    listenerHandle,
    className,
    rank,
    borderRadius,
    listeningDate,
    did,
    albumUri,
    onPress,
    onOpenProfile,
    onPressAlbum,
    withoutAlbumCover,
  } = props;
  const imageSize = size ? size : 80;
  return (
    <View className={`flex flex-row items-center justify-center ${className}`}>
      {rank && (
        <Text
          className="font-rockford-medium text-[#ffffff] text-[14px] mr-[10px]"
          style={{ width: 20 }}
        >
          {rank}
        </Text>
      )}
      {!withoutAlbumCover && (
        <Pressable onPress={() => onPressAlbum(albumUri)}>
          <View className="mr-[15px]">
            <Image
              source={{
                uri: image,
              }}
              style={{ width: imageSize, height: imageSize, borderRadius }}
            />
          </View>
        </Pressable>
      )}
      <View className="flex-1 justify-center">
        <Pressable onPress={() => onPress(did)}>
          <View className="flex flex-row items-center">
            <Text
              className={`font-rockford-regular text-white ${listeningDate ? "w-[86%]" : "w-full"}`}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {title}
            </Text>
            {listeningDate && (
              <Text className="font-rockford-regular text-[#A0A0A0] ml-[10px] text-[12px]">
                {listeningDate}
              </Text>
            )}
          </View>
        </Pressable>
        <Pressable onPress={() => onPress(did)}>
          <Text
            className="font-rockford-regular text-[#A0A0A0] mt-[2px]"
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {artist}
          </Text>
        </Pressable>
        {listenerHandle && (
          <Pressable onPress={() => onOpenProfile!(listenerHandle)}>
            <View className="flex flex-row items-center mt-[2px]">
              <Text className="flex-1 font-rockford-regular text-[#A0A0A0] text-[12px]">
                @{listenerHandle}
              </Text>
            </View>
          </Pressable>
        )}
      </View>
    </View>
  );
};

export default Song;
