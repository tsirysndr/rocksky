import { didAtom } from "@/src/atoms/did";
import { useLovedTracksQuery } from "@/src/hooks/useLibrary";
import { RootStackParamList } from "@/src/Navigation";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import { useAtomValue } from "jotai";
import LovedTracks from "./LovedTracks";

const LovedTracksWithData = () => {
  const did = useAtomValue(didAtom);
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const lovedTracks = useLovedTracksQuery(did!, 0, 20);
  return (
    <LovedTracks
      tracks={
        lovedTracks.data?.records.map(({ track_id: track }: any) => ({
          title: track.title,
          artist: track.artist,
          image: track.album_art,
          uri: track.uri,
          albumUri: track.album_uri,
        })) ?? []
      }
      onSeeAll={() => {}}
      onPressTrack={(uri) => navigation.navigate("SongDetails", { uri })}
      onPressAlbum={(uri) => navigation.navigate("AlbumDetails", { uri })}
    />
  );
};

export default LovedTracksWithData;
