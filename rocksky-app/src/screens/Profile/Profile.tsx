import Chips from "@/src/components/Chips";
import StickyPlayer from "@/src/components/StickyPlayer";
import { RootStackParamList } from "@/src/Navigation";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import { FC, useState } from "react";
import { ScrollView, View } from "react-native";
import LovedTracks from "./LovedTracks";
import Overview from "./Overview";
import Playlists from "./Playlists";
import ProfileHeader from "./ProfileHeader";

export type ProfileProps = {
  bottom?: number;
};

const Profile: FC<ProfileProps> = (props) => {
  const { bottom } = props;
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
      navigation.navigate("UserLibrary");
      return;
    }
    setIndex(key);
  };
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

export default Profile;
