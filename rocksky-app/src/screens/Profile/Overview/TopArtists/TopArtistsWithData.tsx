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
          rank: index + 1,
          name: artist.name,
          image: artist.picture,
        })) ?? []
      }
      onSeeAll={() => {
        if (!handle) {
          navigation.navigate("Profile");
          return;
        }
        navigation.navigate("UserLibrary", { handle });
      }}
      onPressArtist={(uri) => navigation.navigate("ArtistDetails", { uri })}
    />
  );
};

export default TopArtistsWithData;
