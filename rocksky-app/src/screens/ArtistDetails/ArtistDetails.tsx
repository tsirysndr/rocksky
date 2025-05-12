import Song from "@/src/components/Song";
import StickyPlayer from "@/src/components/StickyPlayer";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { FC } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";

export type SongDetailsProps = {
  uri: string;
  onViewOnPDSls: (did: string) => void;
};

const ArtistDetails: FC<SongDetailsProps> = (props) => {
  return (
    <View className="w-full h-full bg-black pt-[50px]">
      <ScrollView className="h-[99%] w-full">
        <View className="items-center justify-start">
          <Image
            source={{
              uri: "https://i.scdn.co/image/ab6761610000e5eb5acb3cb0a8b87d3952738b97",
            }}
            style={{
              width: 200,
              height: 200,
              borderRadius: 100,
            }}
          />
          <Text className="font-rockford-medium text-[#fff] mt-[10px] text-center text-[20px]">
            Fifth Harmony
          </Text>
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
          <Text className="font-rockford-medium text-[#fff] mt-[30px] text-[18px]">
            Popular Songs
          </Text>
          <View className="mt-[15px]">
            <Song
              rank={1}
              title="Work from Home (feat. Ty Dolla $ign)"
              artist="Fifth Harmony"
              image="https://cdn.rocksky.app/covers/cbed73745681d6a170b694ee11bb527c.jpg"
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
              title="All In My Head (Flex) (feat. Fetty Wap)"
              artist="Fifth Harmony"
              image="https://cdn.rocksky.app/covers/cbed73745681d6a170b694ee11bb527c.jpg"
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

export default ArtistDetails;
