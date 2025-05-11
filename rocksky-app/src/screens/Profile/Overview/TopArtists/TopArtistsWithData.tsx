import { RootStackParamList } from "@/src/Navigation";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import TopArtists from "./TopArtists";

const topArtists = [
  {
    rank: 1,
    name: "J. Cole",
    image: "https://i.scdn.co/image/ab6761610000e5eb4b053c29fd4b317ff825f0dc",
  },
  {
    rank: 2,
    name: "Joel Corry",
    image: "https://i.scdn.co/image/ab6761610000e5eb148be0a90a1600cc71126e5b",
  },
  {
    rank: 3,
    name: "Linkin Park",
    image: "https://i.scdn.co/image/ab6761610000e5ebc7e6bd9e65eab62a53355576",
  },
  {
    rank: 4,
    name: "Kiesza",
    image: "https://i.scdn.co/image/ab6761610000e5ebf8449085dadabebe939997a1",
  },
  {
    rank: 5,
    name: "Daft Punk",
    image: "https://i.scdn.co/image/ab6761610000e5eba7bfd7835b5c1eee0c95fa6e",
  },
  {
    rank: 6,
    name: "Patoranking",
    image: "https://i.scdn.co/image/ab6761610000e5eb3f4fb85ebdf70160f64caa10",
  },
];

const TopArtistsWithData = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  return (
    <TopArtists
      artists={topArtists}
      onSeeAll={() => navigation.navigate("UserLibrary")}
      onPressArtist={(did) => navigation.navigate("ArtistDetails")}
    />
  );
};

export default TopArtistsWithData;
