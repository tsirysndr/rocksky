import { didAtom } from "@/src/atoms/did";
import { useRecentTracksByDidQuery } from "@/src/hooks/useProfile";
import { RootStackParamList } from "@/src/Navigation";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import dayjs from "dayjs";
import { useAtomValue } from "jotai";
import RecentTracks from "./RecentTracks";

const RecentTracksWithData = () => {
  const did = useAtomValue(didAtom);
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { data } = useRecentTracksByDidQuery(did!, 0, 10);
  return (
    <RecentTracks
      tracks={
        data?.map((scrobble) => ({
          title: scrobble.title,
          artist: scrobble.artist,
          image: scrobble.album_art!,
          listeningDate: dayjs.utc(scrobble.created_at).local().fromNow(),
        })) ?? []
      }
      onSeeAll={() => navigation.navigate("UserLibrary")}
      onPressTrack={() => navigation.navigate("SongDetails")}
      onPressAlbum={() => navigation.navigate("AlbumDetails")}
    />
  );
};

export default RecentTracksWithData;
