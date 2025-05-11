import StickyPlayer from "@/src/components/StickyPlayer";
import { Text, View } from "react-native";

const AlbumDetails = () => {
  return (
    <View className="h-full w-full bg-black pt-[50px]">
      <Text className="font-rockford-medium text-[#fff] text-[21px]">
        Album Details
      </Text>
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
