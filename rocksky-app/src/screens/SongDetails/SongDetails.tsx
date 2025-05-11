import StickyPlayer from "@/src/components/StickyPlayer";
import { ScrollView, Text, View } from "react-native";

const SongDetails = () => {
  return (
    <View className="w-full h-full bg-black pt-[50px]">
      <ScrollView className="h-[99%] w-full">
        <Text className="font-rockford-regular text-[#fff] text-[21px]">
          Song Details
        </Text>
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
