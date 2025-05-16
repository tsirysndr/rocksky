import { NowPlayings } from "@/src/hooks/useNowPlaying";
import { RootStackParamList } from "@/src/Navigation";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import utc from "dayjs/plugin/utc";
import { FC } from "react";
import { ScrollView } from "react-native";
import Avatar from "./Avatar";

dayjs.extend(relativeTime);
dayjs.extend(utc);

export type StoriesProps = {
  nowPlayings?: NowPlayings;
};

const Stories: FC<StoriesProps> = (props) => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { nowPlayings } = props;
  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {nowPlayings?.map((story, index) => (
          <Avatar
            key={index}
            name={story.handle}
            image={story.avatar}
            size={72}
            className="mr-[10px]"
            onPress={() => {
              navigation.navigate("Story", {
                avatar: story.avatar,
                handle: story.handle,
                title: story.title,
                artist: story.artist,
                albumArt: story.album_art,
                albumUri: "",
                artistUri: story.artist_uri!,
                trackUri: story.track_uri,
                date: dayjs.utc(story.created_at).local().fromNow(),
              });
            }}
          />
        ))}
      </ScrollView>
    </>
  );
};

export default Stories;
