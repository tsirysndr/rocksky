import { didAtom } from "@/src/atoms/did";
import { useTracksQuery } from "@/src/hooks/useLibrary";
import { useProfileStatsByDidQuery } from "@/src/hooks/useProfile";
import { RootStackParamList } from "@/src/Navigation";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAtomValue } from "jotai";
import Tracks from "./Tracks";

const TracksWithData = () => {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const did = useAtomValue(didAtom);
  const { data } = useProfileStatsByDidQuery(did!);
  const tracksResult = useTracksQuery(did!, 0, 20);
  return (
    <Tracks
      tracks={
        tracksResult.data?.map((track: any) => ({
          title: track.title,
          artist: track.artist,
          image: track.album_art,
          uri: track.uri,
          albumUri: track.album_uri,
        })) ?? []
      }
      total={data?.tracks ?? 0}
      onPressTrack={(uri) => navigation.navigate("SongDetails", { uri })}
      onPressAlbum={(uri) => navigation.navigate("AlbumDetails", { uri })}
    />
  );
};

export default TracksWithData;
