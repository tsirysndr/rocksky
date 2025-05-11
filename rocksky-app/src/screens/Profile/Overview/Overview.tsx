import Stats from "@/src/components/Stats";
import { View } from "react-native";
import RecentTracks from "./RecentTracks";
import TopAlbums from "./TopAlbums";
import TopArtists from "./TopArtists";
import TopTracks from "./TopTracks";

const Overview = () => {
  return (
    <View className="w-full mt-[20px]">
      <Stats scrobbles={10465} artists={716} lovedTracks={1024} />
      <RecentTracks />
      <TopArtists />
      <TopAlbums />
      <TopTracks className="mt-[-20px]" />
    </View>
  );
};

export default Overview;
