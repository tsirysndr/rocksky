import { didAtom } from "@/src/atoms/did";
import { useArtistsQuery } from "@/src/hooks/useLibrary";
import { RootStackParamList } from "@/src/Navigation";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import { useAtomValue } from "jotai";
import TopArtists from "./TopArtists";

const TopArtistsWithData = () => {
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
      onSeeAll={() => navigation.navigate("UserLibrary")}
      onPressArtist={(did) => navigation.navigate("ArtistDetails")}
    />
  );
};

export default TopArtistsWithData;
