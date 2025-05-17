import Chips from "@/src/components/Chips";
import StickyPlayer from "@/src/components/StickyPlayer";
import { FC, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import Albums from "./Albums";
import Artists from "./Artists";
import Scrobbles from "./Scrobbles";
import Tracks from "./Tracks";

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
  const [activeChip, setActiveChip] = useState(0);

  return (
    <View className="w-full h-full bg-black">
      <ScrollView
        style={{
          flex: 1,
        }}
      >
        <Text className="font-rockford-medium text-[#fff] text-[21px] mt-[50px] pl-[15px] pr-[15px]">
          Library
        </Text>
        <View>
          <Chips
            items={chips}
            onChange={(key) => setActiveChip(key as number)}
          />
        </View>
        {activeChip === 0 && <Scrobbles />}
        {activeChip === 1 && <Artists />}
        {activeChip === 2 && <Albums />}
        {activeChip === 3 && <Tracks />}
      </ScrollView>
      <View
        className={`w-full absolute bottom-0 bg-[#000]`}
        style={{
          bottom: bottom || 0,
        }}
      >
        <StickyPlayer />
      </View>
    </View>
  );
};

export default Library;
