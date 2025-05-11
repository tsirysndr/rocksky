import { RootStackParamList } from "@/src/Navigation";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import { FC } from "react";
import TopTracks from "./TopTracks";

const tracks = [
  {
    title: "Bad Dream",
    artist: "Cannons",
    image:
      "https://cdn.rocksky.app/covers/cc969b71214e8e8fb65fbfd5892dabcb.jpg",
  },
  {
    title: "No Enemiesz",
    artist: "Kiesza",
    image:
      "https://cdn.rocksky.app/covers/e02bb04c7c33799e8bcf7fb4d3e07335.jpg",
  },
  {
    title: "Hideaway",
    artist: "Kiesza",
    image:
      "https://cdn.rocksky.app/covers/e02bb04c7c33799e8bcf7fb4d3e07335.jpg",
  },
  {
    title: "Sinner",
    artist: "Nu Aspect",
    image:
      "https://cdn.rocksky.app/covers/2152198cf875936537ecdf92faa77469.jpg",
  },
  {
    title: "Flowers (feat. Jaykae and MALIKA)",
    artist: "Nathan Dawe",
    image:
      "https://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:7vdlgi2bflelz7mmuxoqjfcr/bafkreigqdrg5pmv7ji7f72ricgqjyneno5j5qzeppsqmoy3yek3wqv3fca@jpeg",
  },
  {
    title: "Sorry",
    artist: "Joel Corry",
    image:
      "https://cdn.rocksky.app/covers/ec9bbc208b04182f315f8137cfb2125b.jpg",
  },
  {
    title: "3 Libras",
    artist: "A Perfect Circle",
    image: "https://i.scdn.co/image/ab67616d0000b2732d73b494efcb99356f8c7b28",
  },
];

export type TopTracksWithDataProps = {
  className?: string;
};

const TopTracksWithData: FC<TopTracksWithDataProps> = (props) => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  return (
    <TopTracks
      {...props}
      tracks={tracks}
      onSeeAll={() => navigation.navigate("UserLibrary")}
      onPressTrack={(did) => navigation.navigate("SongDetails")}
      onPressAlbum={() => navigation.navigate("AlbumDetails")}
    />
  );
};

export default TopTracksWithData;
