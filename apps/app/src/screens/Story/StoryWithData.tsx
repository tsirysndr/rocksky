import {
  type RouteProp,
  useIsFocused,
  useNavigation,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAtomValue } from "jotai";
import type { FC } from "react";
import { storiesAtom } from "@/src/atoms/stories";
import { useStoriesQuery } from "@/src/hooks/useStories";
import type { RootStackParamList } from "@/src/Navigation";
import { storage } from "@/src/storage";
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
  const active = useIsFocused();
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
      active={active}
      onAddShout={(story) => {
        if (!storage.getToken()) {
          navigation.navigate("SignIn");
          return;
        }
        const scrobble = story.uri?.includes("/app.rocksky.scrobble/");
        const uri = scrobble ? story.uri : story.trackUri;
        if (uri)
          navigation.push("ShoutEditor", {
            uri,
            type: scrobble ? "scrobble" : "song",
            title: story.title,
            picture: story.albumArt,
          });
      }}
      onShare={(story) => {
        const isScrobble = story.uri?.includes("/app.rocksky.scrobble/");
        // Open a fresh customization screen above the paused story viewer.
        navigation.push("ShareCard", {
          item: {
            kind: isScrobble ? "scrobble" : "track",
            uri: isScrobble ? story.uri : story.trackUri || "",
            title: story.title,
            subtitle: story.albumArtist || story.artist,
            owner: { did: story.did, handle: story.handle },
            artwork: story.albumArt,
          },
        });
      }}
      index={route?.params?.index}
      onOpenProfile={(did) => openInHomeTab("UserProfile", { did })}
      onPressArtist={(uri) => openInHomeTab("ArtistDetails", { uri })}
      onPressTrack={(uri) => openInHomeTab("SongDetails", { uri })}
      onClose={() => navigation.goBack()}
    />
  );
};

export default StoryWithData;
