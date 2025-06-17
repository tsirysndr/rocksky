import Stats from "@/src/components/Stats";
import { View } from "react-native";
import RecentTracks from "./RecentTracks";
import TopAlbums from "./TopAlbums";
import TopArtists from "./TopArtists";
import TopTracks from "./TopTracks";

const Overview = () => {
  return (
    <View className="w-full mt-[20px]">
      <Stats />
      <RecentTracks />
      <TopArtists />
      <TopAlbums />
      <TopTracks className="mt-[-20px]" />
    </View>
  );
};

export default Overview;
