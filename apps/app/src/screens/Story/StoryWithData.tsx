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

  // The viewer is a root-level full-screen modal; detail routes live inside
  // the tab stacks, so close the modal first and navigate into the home tab.
  const openInHomeTab = (
    screen: "UserProfile" | "ArtistDetails" | "SongDetails",
    params: Record<string, string>,
  ) => {
    navigation.goBack();
    navigation.navigate("HomeTabs", {
      screen: "HomeTab",
      params: { screen, params },
    } as never);
  };

  return (
    <Story
      stories={stories}
      index={route?.params?.index}
      onOpenProfile={(did) => openInHomeTab("UserProfile", { did })}
      onPressArtist={(uri) => openInHomeTab("ArtistDetails", { uri })}
      onPressTrack={(uri) => openInHomeTab("SongDetails", { uri })}
      onClose={() => navigation.goBack()}
    />
  );
};

export default StoryWithData;
