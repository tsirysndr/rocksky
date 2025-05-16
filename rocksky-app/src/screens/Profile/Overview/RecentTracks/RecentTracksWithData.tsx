import { didAtom } from "@/src/atoms/did";
import { handleAtom } from "@/src/atoms/handle";
import { useRecentTracksByDidQuery } from "@/src/hooks/useProfile";
import { RootStackParamList } from "@/src/Navigation";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import dayjs from "dayjs";
import { useAtomValue } from "jotai";
import RecentTracks from "./RecentTracks";

const RecentTracksWithData = () => {
  const handle = useAtomValue(handleAtom);
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
      onSeeAll={() => {
        if (!handle) {
          navigation.navigate("Profile");
          return;
        }
        navigation.navigate("UserLibrary", { handle });
      }}
      onPressTrack={(uri) => navigation.navigate("SongDetails", { uri })}
      onPressAlbum={(uri) => navigation.navigate("AlbumDetails", { uri })}
    />
  );
};

export default RecentTracksWithData;
