import { didAtom } from "@/src/atoms/did";
import { useArtistsQuery } from "@/src/hooks/useLibrary";
import { useProfileStatsByDidQuery } from "@/src/hooks/useProfile";
import { RootStackParamList } from "@/src/Navigation";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAtomValue } from "jotai";
import Artists from "./Artists";

const ArtistsWithData = () => {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const did = useAtomValue(didAtom);
  const { data } = useProfileStatsByDidQuery(did!);
  const artists = useArtistsQuery(did!, 0, 20);
  return (
    <Artists
      artists={
        artists.data?.map((artist: any, index: number) => ({
          rank: index + 1,
          name: artist.name,
          image: artist.picture,
          uri: artist.uri,
        })) ?? []
      }
      total={data?.artists ?? 0}
      onPressArtist={(uri) => navigation.navigate("ArtistDetails", { uri })}
    />
  );
};

export default ArtistsWithData;
