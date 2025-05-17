import { didAtom } from "@/src/atoms/did";
import { useAlbumsQuery } from "@/src/hooks/useLibrary";
import { useProfileStatsByDidQuery } from "@/src/hooks/useProfile";
import { RootStackParamList } from "@/src/Navigation";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAtomValue } from "jotai";
import Albums from "./Albums";

const AlbumsWithData = () => {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const did = useAtomValue(didAtom);
  const { data } = useProfileStatsByDidQuery(did!);
  const albums = useAlbumsQuery(did!, 0, 20);
  return (
    <Albums
      albums={
        albums.data?.map((album: any) => ({
          title: album.title,
          artist: album.artist,
          cover: album.album_art,
          uri: album.uri,
        })) ?? []
      }
      total={data?.albums ?? 0}
      onPressAlbum={(uri) => navigation.navigate("AlbumDetails", { uri })}
    />
  );
};

export default AlbumsWithData;
