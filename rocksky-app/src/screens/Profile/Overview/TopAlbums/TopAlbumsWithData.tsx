import { didAtom } from "@/src/atoms/did";
import { handleAtom } from "@/src/atoms/handle";
import { useAlbumsQuery } from "@/src/hooks/useLibrary";
import { RootStackParamList } from "@/src/Navigation";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import { useAtomValue } from "jotai";
import TopAlbums from "./TopAlbums";

const TopAlbumsWithData = () => {
  const handle = useAtomValue(handleAtom);
  const did = useAtomValue(didAtom);
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { data } = useAlbumsQuery(did!);
  return (
    <TopAlbums
      albums={
        data?.map((album: any, index: number) => ({
          artist: album.artist,
          title: album.title,
          image: album.album_art,
        })) ?? []
      }
      onSeeAll={() => {
        if (!handle) {
          navigation.navigate("Profile");
          return;
        }
        navigation.navigate("UserLibrary", { handle });
      }}
      onPressAlbum={(uri) => navigation.navigate("AlbumDetails", { uri })}
    />
  );
};

export default TopAlbumsWithData;
