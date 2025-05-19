import { handleAtom } from "@/src/atoms/handle";
import Chips from "@/src/components/Chips";
import ScrollToTopButton from "@/src/components/ScrollToTopButton";
import StickyPlayer from "@/src/components/StickyPlayer";
import useScrollToTop from "@/src/hooks/useScrollToTop";
import { RootStackParamList } from "@/src/Navigation";
import { useNowPlayingContext } from "@/src/providers/NowPlayingProvider";
import { RouteProp } from "@react-navigation/native";
import { useSetAtom } from "jotai";
import { FC, useEffect, useState } from "react";
import { Text, View } from "react-native";
import Albums from "./Albums";
import Artists from "./Artists";
import Scrobbles from "./Scrobbles";
import Tracks from "./Tracks";

type LibraryRouteProp = RouteProp<
  RootStackParamList,
  "Library" | "UserLibrary"
>;

export type LibraryProps = Partial<{
  route: LibraryRouteProp;
  bottom?: number;
}>;

const Library: FC<LibraryProps> = (props) => {
  const { bottom, route } = props;
  const setHandle = useSetAtom(handleAtom);
  const { scrollToTop, isVisible, fadeAnim, handleScroll, listRef } =
    useScrollToTop();
  const nowPlaying = useNowPlayingContext();

  const chips = [
    { label: "Scrobbles", key: 0 },
    { label: "Artists", key: 1 },
    { label: "Albums", key: 2 },
    { label: "Tracks", key: 3 },
  ];
  const [activeChip, setActiveChip] = useState(0);

  useEffect(() => {
    setHandle(route?.params?.handle);
  }, [route?.params?.handle]);

  useEffect(() => {
    if (route?.params?.tab) {
      setActiveChip(route.params.tab);
    }
  }, [route?.params?.tab]);

  const bottomButtonPosition = nowPlaying ? 80 : 20;

  return (
    <View className="w-full h-full bg-black">
      <View className="pl-[15px] pr-[15px]">
        <Text className="font-rockford-medium text-[#fff] text-[21px] mt-[50px]">
          Library
        </Text>
        <View>
          <Chips
            items={chips}
            onChange={(key) => setActiveChip(key as number)}
            active={activeChip}
          />
        </View>
        {activeChip === 0 && (
          <Scrobbles handleScroll={handleScroll} listRef={listRef} />
        )}
        {activeChip === 1 && (
          <Artists handleScroll={handleScroll} listRef={listRef} />
        )}
        {activeChip === 2 && (
          <Albums handleScroll={handleScroll} listRef={listRef} />
        )}
        {activeChip === 3 && (
          <Tracks handleScroll={handleScroll} listRef={listRef} />
        )}
      </View>
      {isVisible && (
        <ScrollToTopButton
          fadeAnim={fadeAnim}
          bottom={bottomButtonPosition}
          onPress={scrollToTop}
        />
      )}
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
