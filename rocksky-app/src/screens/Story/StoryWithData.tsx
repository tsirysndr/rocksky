import { useNowPlayingsQuery } from "@/src/hooks/useNowPlaying";
import { RootStackParamList } from "@/src/Navigation";
import { RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import utc from "dayjs/plugin/utc";
import { FC } from "react";
import Story from "./Story";

dayjs.extend(relativeTime);
dayjs.extend(utc);

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
  const { data } = useNowPlayingsQuery();
  return (
    <Story
      stories={(data || []).map((story) => ({
        ...story,
        created_at: dayjs.utc(story.created_at).local().fromNow(),
      }))}
      onOpenProfile={(handle: string) =>
        navigation!.navigate("UserProfile", { handle })
      }
      onPressAlbum={(uri: string) =>
        navigation!.navigate("AlbumDetails", { uri })
      }
      onPressArtist={(uri: string) =>
        navigation!.navigate("ArtistDetails", { uri })
      }
      onPressTrack={(uri) => navigation!.navigate("SongDetails", { uri })}
      index={route?.params?.index}
    />
  );
};

export default StoryWithData;
