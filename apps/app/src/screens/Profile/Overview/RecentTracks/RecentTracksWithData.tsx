import { didAtom } from "@/src/atoms/did";
import { handleAtom } from "@/src/atoms/handle";
import { useRecentTracksByDidQuery } from "@/src/hooks/useProfile";
import { RootStackParamList } from "@/src/Navigation";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import dayjs from "dayjs";
import { useAtomValue } from "jotai";
import RecentTracks from "./RecentTracks";

const RecentTracksWithData = () => {
  const handle = useAtomValue(handleAtom);
  const did = useAtomValue(didAtom);
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { data } = useRecentTracksByDidQuery(did!, 0, 10);
  return (
    <RecentTracks
      tracks={
        data?.map((scrobble) => ({
          id: scrobble.id,
          title: scrobble.title,
          artist: scrobble.artist,
          image: scrobble.album_art!,
          listeningDate: dayjs.utc(scrobble.created_at).local().fromNow(),
          uri: scrobble.uri,
          albumUri: scrobble.album_uri,
        })) ?? []
      }
      onSeeAll={() => {
        navigation.push("UserLibrary", { handle, tab: 0 });
      }}
      onPressTrack={(uri) => navigation.push("SongDetails", { uri })}
      onPressAlbum={(uri) => navigation.push("AlbumDetails", { uri })}
    />
  );
};

export default RecentTracksWithData;
