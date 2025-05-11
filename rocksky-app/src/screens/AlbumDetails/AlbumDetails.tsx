import StickyPlayer from "@/src/components/StickyPlayer";
import { Image, ScrollView, Text, View } from "react-native";

const AlbumDetails = () => {
  return (
    <View className="h-full w-full bg-black pt-[50px]">
      <ScrollView>
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
            style={{ fontSize: 16 }}
          >
            Meteora 20th Anniversary Edition
          </Text>
          <Text className="font-rockford-medium text-[#A0A0A0] text-[14px] mt-[5px] text-center">
            Linkin Park
          </Text>
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

export default AlbumDetails;
