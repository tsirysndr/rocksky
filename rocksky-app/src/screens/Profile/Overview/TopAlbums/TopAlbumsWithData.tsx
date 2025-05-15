import { useAlbumsQuery } from "@/src/hooks/useLibrary";
import { RootStackParamList } from "@/src/Navigation";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import TopAlbums from "./TopAlbums";

const albums = [
  {
    artist: "Joel Corry",
    title: "Another Friday Night",
    image:
      "https://cdn.rocksky.app/covers/ec9bbc208b04182f315f8137cfb2125b.jpg",
  },
  {
    artist: "Jazzy",
    title: "Constellations (Expanded)",
    image:
      "https://cdn.rocksky.app/covers/e27039e89dbccf04a6a698cd0b6e160b.jpg",
  },
  {
    artist: "The Weeknd",
    title: "Hurry Up Tomorrow",
    image:
      "https://cdn.rocksky.app/covers/a4f0a009ce6ecf71949612674aed84dd.jpg",
  },
  {
    artist: "Linkin Park",
    title: "Meteora 20th Anniversary Edition",
    image:
      "https://cdn.rocksky.app/covers/da9e82337eb069388e05b93f89c9c41c.jpg",
  },
];

const TopAlbumsWithData = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { data } = useAlbumsQuery("did:plc:7vdlgi2bflelz7mmuxoqjfcr");
  return (
    <TopAlbums
      albums={
        data?.map((album: any, index: number) => ({
          artist: album.artist,
          title: album.title,
          image: album.album_art,
        })) ?? []
      }
      onSeeAll={() => navigation.navigate("UserLibrary")}
      onPressAlbum={(did) => navigation.navigate("AlbumDetails")}
    />
  );
};

export default TopAlbumsWithData;
