import Song from "@/src/components/Song";
import StickyPlayer from "@/src/components/StickyPlayer";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import dayjs from "dayjs";
import { FC, useEffect, useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";

export type AlbumDetailsProps = {
  albumArt: string;
  title: string;
  artist: string;
  artistUri: string;
  uri: string;
  year: number;
  releaseDate: string;
  label: string;
  tracks: {
    id: string;
    title: string;
    artist: string;
    artistUri: string;
    trackNumber: number;
    discNumber: number;
    uri: string;
  }[];
  onPressArtist: (artistDid: string) => void;
  onPressTrack: (trackDid: string) => void;
  onViewOnPDSls: (did: string) => void;
};

const AlbumDetails: FC<AlbumDetailsProps> = (props) => {
  const [disc, setDisc] = useState(1);

  useEffect(() => {
    setDisc(Math.max(...props.tracks.map((track) => track.discNumber)));
  }, [props.tracks]);

  return (
    <View className="h-full w-full bg-black pt-[50px]">
      <ScrollView
        className="mb-[60px] pl-[15px] pr-[15px]"
        showsVerticalScrollIndicator={false}
      >
        <View className="items-center justify-start">
          <Image
            source={{
              uri: "https://cdn.rocksky.app/covers/da9e82337eb069388e05b93f89c9c41c.jpg",
            }}
            style={{
              width: 200,
              height: 200,
            }}
          />
          <Text
            className="font-rockford-medium text-[#fff] mt-[10px] text-center"
            style={{ fontSize: 18 }}
          >
            {props.title}
          </Text>
          <Pressable onPress={() => props.onPressArtist(props.artistUri)}>
            <Text className="font-rockford-medium text-[#A0A0A0] text-[14px] mt-[5px] text-center">
              {props.artist}
            </Text>
          </Pressable>
          <Text className="font-rockford-regular text-[#A0A0A0] text-[12px] mt-[5px] text-center">
            {props.year}
          </Text>
        </View>
        <View>
          <View className="flex-row">
            <View className="mr-[20px]">
              <Text className="font-rockford-regular text-[#A0A0A0] text-[14px] mt-[10px] ">
                Listeners
              </Text>
              <Text className="font-rockford-regular text-white text-[18px]">
                2,565
              </Text>
            </View>
            <View className="flex-1">
              <Text className="font-rockford-regular text-[#A0A0A0] text-[14px] mt-[10px] ">
                Scrobbles
              </Text>
              <Text className="font-rockford-regular text-white text-[18px]">
                3,256
              </Text>
            </View>
            <View>
              <Pressable onPress={() => props.onViewOnPDSls(props.uri)}>
                <View className="h-[40px] flex-row items-center justify-center mt-[10px]">
                  <Text className="font-rockford-regular text-white text-[14px]  mr-[10px]">
                    View on PDSls
                  </Text>
                  <FontAwesome name="external-link" size={18} color="white" />
                </View>
              </Pressable>
            </View>
          </View>
        </View>

        {disc < 2 && (
          <View className="mt-[20px]">
            {props.tracks.map((track) => (
              <Song
                key={track.id}
                rank={track.trackNumber}
                title={track.title}
                artist={track.artist}
                size={60}
                className="mt-[10px]"
                onPress={() => props.onPressTrack(track.id)}
                onPressAlbum={() => {}}
                did={track.id}
                withoutAlbumCover
                albumUri=""
              />
            ))}
          </View>
        )}
        {disc > 1 && (
          <View className="mt-[15px]">
            {Array.from({ length: disc }, (_, index) => (
              <View key={index} className="mt-[15px]">
                <Text className="font-rockford-medium text-white text-[16px] mt-[5px]">
                  Volume {index + 1}
                </Text>
                {props.tracks
                  .filter((track) => track.discNumber === index + 1)
                  .map((track) => (
                    <Song
                      key={track.id}
                      rank={track.trackNumber}
                      title={track.title}
                      artist={track.artist}
                      size={60}
                      className="mt-[10px]"
                      onPress={() => props.onPressTrack(track.id)}
                      onPressAlbum={() => {}}
                      did={track.id}
                      withoutAlbumCover
                      albumUri=""
                    />
                  ))}
              </View>
            ))}
            <Text className="font-rockford-regular text-[#A0A0A0] text-[12px] mt-[20px] ">
              {dayjs(props.releaseDate).format("MMMM D, YYYY")}
            </Text>
            <Text className="font-rockford-regular text-[#A0A0A0] text-[12px]">
              {props.label}
            </Text>
          </View>
        )}
        <View className="h-[80px]" />
      </ScrollView>

      <View className="w-full absolute bottom-0 bg-black">
        <StickyPlayer
          isPlaying={true}
          onPlay={() => {}}
          onPause={() => {}}
          progress={50}
          song={{
            title: "Tyler Herro",
            artist: "Jack Harlow",
            cover:
              "https://i.scdn.co/image/ab67616d0000b273aeb14ead136118a987246b63",
          }}
        />
      </View>
    </View>
  );
};

export default AlbumDetails;
