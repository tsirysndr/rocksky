import { handleAtom } from "@/src/atoms/handle";
import Chips from "@/src/components/Chips";
import StickyPlayer from "@/src/components/StickyPlayer";
import { RootStackParamList } from "@/src/Navigation";
import {
  NavigationProp,
  RouteProp,
  useNavigation,
} from "@react-navigation/native";
import { useAtom } from "jotai";
import { FC, useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import LovedTracks from "./LovedTracks";
import Overview from "./Overview";
import Playlists from "./Playlists";
import ProfileHeader from "./ProfileHeader";

type StoryScreenRouteProp = RouteProp<RootStackParamList, "Story">;

export type ProfileProps = {
  bottom?: number;
  route?: StoryScreenRouteProp;
};

const Profile: FC<ProfileProps> = (props) => {
  const { bottom, route } = props;
  const [handle, setHandle] = useAtom(handleAtom);
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const [index, setIndex] = useState(0);
  const chips = [
    { label: "Overview", key: 0 },
    { label: "Library", key: 1 },
    { label: "Playlists", key: 2 },
    { label: "Loved Tracks", key: 3 },
  ];
  const onChangeChip = (key: number) => {
    if (key === 1) {
      navigation.navigate("UserLibrary", { handle });
      return;
    }
    setIndex(key);
  };

  useEffect(() => {
    setHandle(route?.params?.handle);
  }, [route?.params?.handle]);

  return (
    <View className="h-full w-full bg-black">
      <ScrollView
        showsVerticalScrollIndicator={false}
        className="pl-[10px] pr-[10px]"
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
