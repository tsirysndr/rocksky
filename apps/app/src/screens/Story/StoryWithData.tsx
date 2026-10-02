import { type RouteProp, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAtomValue } from "jotai";
import type { FC } from "react";
import { storiesAtom } from "@/src/atoms/stories";
import { useStoriesQuery } from "@/src/hooks/useStories";
import type { RootStackParamList } from "@/src/Navigation";
import Story from "./Story";

type StoryScreenRouteProp = RouteProp<RootStackParamList, "Story">;
type StoryScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  "Story"
>;

export type StoryWithDataProps = Partial<{
  route: StoryScreenRouteProp;
}>;

const StoryWithData: FC<StoryWithDataProps> = ({ route }) => {
  const navigation = useNavigation<StoryScreenNavigationProp>();
  const handedOff = useAtomValue(storiesAtom);
  const { data: fetched } = useStoriesQuery();
  const stories = handedOff.length ? handedOff : (fetched ?? []);

  return (
    <Story
      stories={stories}
      index={route?.params?.index}
      onOpenProfile={(did) => navigation.navigate("UserProfile", { did })}
      onPressArtist={(uri) => navigation.navigate("ArtistDetails", { uri })}
      onPressTrack={(uri) => navigation.navigate("SongDetails", { uri })}
      onClose={() => navigation.goBack()}
    />
  );
};

export default StoryWithData;
