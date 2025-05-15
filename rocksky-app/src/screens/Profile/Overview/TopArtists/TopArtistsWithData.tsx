import { useArtistsQuery } from "@/src/hooks/useLibrary";
import { RootStackParamList } from "@/src/Navigation";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import TopArtists from "./TopArtists";

const TopArtistsWithData = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { data } = useArtistsQuery("did:plc:7vdlgi2bflelz7mmuxoqjfcr");
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
