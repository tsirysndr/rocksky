import { didAtom } from "@/src/atoms/did";
import { handleAtom } from "@/src/atoms/handle";
import { useArtistsQuery } from "@/src/hooks/useLibrary";
import { RootStackParamList } from "@/src/Navigation";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import { useAtomValue } from "jotai";
import TopArtists from "./TopArtists";

const TopArtistsWithData = () => {
  const handle = useAtomValue(handleAtom);
  const did = useAtomValue(didAtom);
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { data } = useArtistsQuery(did!);
  return (
    <TopArtists
      artists={
        data?.map((artist: any, index: number) => ({
          id: artist.id,
          rank: index + 1,
          name: artist.name,
          image: artist.picture,
          uri: artist.uri,
        })) ?? []
      }
      onSeeAll={() => {
        navigation.navigate("UserLibrary", { handle, tab: 1 });
      }}
      onPressArtist={(uri) => navigation.navigate("ArtistDetails", { uri })}
    />
  );
};

export default TopArtistsWithData;
