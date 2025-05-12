import Song from "@/src/components/Song";
import StickyPlayer from "@/src/components/StickyPlayer";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { FC } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";

export type SongDetailsProps = {
  uri: string;
  onViewOnPDSls: (did: string) => void;
};

const SongDetails: FC<SongDetailsProps> = (props) => {
  return (
    <View className="w-full h-full bg-black pt-[50px]">
      <ScrollView className="h-[99%] w-full">
        <View className="items-center justify-start">
          <Image
            source={{
              uri: "https://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:7vdlgi2bflelz7mmuxoqjfcr/bafkreidblyuwxhkcxwn7iwfffsbbmnq6djqxnjw2aujcturrhumrxigvsq@jpeg",
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
            Crazy What Love Can Do
          </Text>
          <Pressable onPress={() => {}}>
            <Text className="font-rockford-medium text-[#A0A0A0] text-[14px] mt-[5px] text-center">
              David Guetta
            </Text>
          </Pressable>
        </View>

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

        <View>
          <Text className="font-rockford-regular text-white text-[14px] mt-[35px] ">
            Popular Tracks by
          </Text>
          <Text className="font-rockford-medium text-white text-[18px] mt-[-5px] ">
            David Guetta
          </Text>
        </View>

        <View className="mt-[15px]">
          <Song
            rank={1}
            title="Crazy What Love Can Do"
            artist="David Guetta"
            image="https://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:7vdlgi2bflelz7mmuxoqjfcr/bafkreidblyuwxhkcxwn7iwfffsbbmnq6djqxnjw2aujcturrhumrxigvsq@jpeg"
            onPress={() => {}}
            onOpenBlueskyProfile={() => {}}
            onPressAlbum={() => {}}
            withoutAlbumCover={false}
            size={60}
            className="mt-[10px]"
            borderRadius={8}
            did=""
          />
          <Song
            rank={2}
            title="Forever Young"
            artist="David Guetta"
            image="https://i.scdn.co/image/ab67616d0000b273417f8c5927888d7ee97cb05a"
            onPress={() => {}}
            onOpenBlueskyProfile={() => {}}
            onPressAlbum={() => {}}
            withoutAlbumCover={false}
            size={60}
            className="mt-[10px]"
            borderRadius={8}
            did=""
          />
        </View>
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

export default SongDetails;
