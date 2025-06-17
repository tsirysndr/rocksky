import { handleAtom } from "@/src/atoms/handle";
import Chips from "@/src/components/Chips";
import ScrollToTopButton from "@/src/components/ScrollToTopButton";
import StickyPlayer from "@/src/components/StickyPlayer";
import useScrollToTop from "@/src/hooks/useScrollToTop";
import { RootStackParamList } from "@/src/Navigation";
import { useNowPlayingContext } from "@/src/providers/NowPlayingProvider";
import { RouteProp, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAtom } from "jotai";
import { FC, useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import LovedTracks from "./LovedTracks";
import Overview from "./Overview";
import Playlists from "./Playlists";
import ProfileHeader from "./ProfileHeader";

type ProfileScreenRouteProp = RouteProp<
  RootStackParamList,
  "Profile" | "UserProfile"
>;

export type ProfileProps = {
  bottom?: number;
  route?: ProfileScreenRouteProp;
};

const Profile: FC<ProfileProps> = (props) => {
  const { bottom, route } = props;
  const { scrollToTop, isVisible, fadeAnim, handleScroll, scrollViewRef } =
    useScrollToTop();
  const nowPlaying = useNowPlayingContext();
  const [handle, setHandle] = useAtom(handleAtom);
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [index, setIndex] = useState(0);
  const chips = [
    { label: "Overview", key: 0 },
    { label: "Library", key: 1 },
    { label: "Playlists", key: 2 },
    { label: "Loved Tracks", key: 3 },
  ];
  const onChangeChip = (key: number) => {
    if (key === 1) {
      navigation.push("UserLibrary", { handle, tab: 0 });
      return;
    }
    setIndex(key);
  };

  useEffect(() => {
    setHandle(route?.params?.handle);
  }, [route?.params?.handle]);

  const bottomButtonPosition = nowPlaying ? 80 : 20;

  return (
    <View className="h-full w-full bg-black">
      <ScrollView
        showsVerticalScrollIndicator={false}
        className="pl-[10px] pr-[10px]"
        ref={scrollViewRef}
        onScroll={handleScroll}
      >
        <ProfileHeader />
        <Chips
          items={chips}
          onChange={(x) => onChangeChip(x as number)}
          active={index}
        />
        {index === 0 && <Overview />}
        {index === 2 && <Playlists />}
        {index === 3 && <LovedTracks />}
      </ScrollView>

      {isVisible && (
        <ScrollToTopButton
          fadeAnim={fadeAnim}
          bottom={bottomButtonPosition}
          onPress={scrollToTop}
        />
      )}

      <View
        className="w-full absolute bottom-0 bg-black"
        style={{ bottom: bottom || 0 }}
      >
        <StickyPlayer />
      </View>
    </View>
  );
};

export default Profile;
