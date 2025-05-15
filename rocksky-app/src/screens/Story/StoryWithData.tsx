import { RootStackParamList } from "@/src/Navigation";
import { RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { FC } from "react";
import Story from "./Story";

type StoryScreenRouteProp = RouteProp<RootStackParamList, "Story">;
type StoryScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  "Story"
>;

export type StoryWithDataProps = Partial<{
  route: StoryScreenRouteProp;
  navigation: StoryScreenNavigationProp;
}>;

const StoryWithData: FC<StoryWithDataProps> = (props) => {
  const { route, navigation } = props;

  return (
    <Story
      handle={route!.params.handle}
      avatar={route!.params.avatar}
      title={route!.params.title}
      albumArt={route!.params.albumArt}
      artist={route!.params.artist}
      artistUri={route!.params.artistUri}
      albumUri={route!.params.albumUri}
      trackUri={route!.params.trackUri}
      date={route!.params.date}
      onOpenBlueskyProfile={() => navigation!.navigate("UserProfile")}
      onPressAlbum={() => navigation!.navigate("AlbumDetails")}
      onPressArtist={() => navigation!.navigate("ArtistDetails")}
      onPressTrack={() => navigation!.navigate("SongDetails")}
    />
  );
};

export default StoryWithData;
