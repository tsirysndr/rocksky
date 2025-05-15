import { useRecentTracksByDidQuery } from "@/src/hooks/useProfile";
import { RootStackParamList } from "@/src/Navigation";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import RecentTracks from "./RecentTracks";

const RecentTracksWithData = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { data } = useRecentTracksByDidQuery(
    "did:plc:7vdlgi2bflelz7mmuxoqjfcr",
    0,
    10
  );
  return (
    <RecentTracks
      tracks={
        data?.map((scrobble) => ({
          title: scrobble.title,
          artist: scrobble.artist,
          image: scrobble.album_art!,
        })) ?? []
      }
      onSeeAll={() => navigation.navigate("UserLibrary")}
      onPressTrack={() => navigation.navigate("SongDetails")}
      onPressAlbum={() => navigation.navigate("AlbumDetails")}
    />
  );
};

export default RecentTracksWithData;
