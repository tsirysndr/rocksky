import { didAtom } from "@/src/atoms/did";
import {
  useProfileStatsByDidQuery,
  useRecentTracksByDidQuery,
} from "@/src/hooks/useProfile";
import { RootStackParamList } from "@/src/Navigation";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import dayjs from "dayjs";
import { useAtomValue } from "jotai";
import Scrobbles from "./Scrobbles";

const ScrobblesWithData = () => {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const did = useAtomValue(didAtom);
  const { data } = useProfileStatsByDidQuery(did!);
  const recentTracksResult = useRecentTracksByDidQuery(did!, 0, 20);
  return (
    <Scrobbles
      scrobbles={
        recentTracksResult.data?.map((scrobble) => ({
          title: scrobble.title,
          artist: scrobble.artist,
          image: scrobble.album_art!,
          listeningDate: dayjs.utc(scrobble.created_at).local().fromNow(),
          uri: scrobble.uri,
          albumUri: scrobble.album_uri,
        })) ?? []
      }
      total={data?.scrobbles ?? 0}
      onPressAlbum={(uri) => navigation.navigate("AlbumDetails", { uri })}
      onPressTrack={(uri) => navigation.navigate("SongDetails", { uri })}
    />
  );
};

export default ScrobblesWithData;
