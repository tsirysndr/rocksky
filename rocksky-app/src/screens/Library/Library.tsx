import Chips from "@/src/components/Chips";
import StickyPlayer from "@/src/components/StickyPlayer";
import { FC } from "react";
import { Text, View } from "react-native";

export type LibraryProps = {
  bottom?: number;
};

const Library: FC<LibraryProps> = (props) => {
  const { bottom } = props;
  const chips = [
    { label: "Scrobbles", key: 0 },
    { label: "Artists", key: 1 },
    { label: "Albums", key: 2 },
    { label: "Tracks", key: 3 },
  ];
  return (
    <View className="w-full h-full bg-black">
      <Text className="font-rockford-medium text-[#fff] text-[21px] mt-[50px] pl-[15px] pr-[15px]">
        Library
      </Text>
      <Chips items={chips} />
      <View
        className={`w-full absolute bottom-0 bg-[#000]`}
        style={{
          bottom: bottom || 0,
        }}
      >
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

export default Library;
