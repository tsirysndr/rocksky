import { RootStackParamList } from "@/src/Navigation";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import RecentTracks from "./RecentTracks";

const recents = [
  {
    title: "Work from Home (feat. Ty Dolla $ign)",
    artist: "Fith Harmony",
    image:
      "https://cdn.rocksky.app/covers/cbed73745681d6a170b694ee11bb527c.jpg",
  },
  {
    title: "BED",
    artist: "Joel Corry",
    image: "https://i.scdn.co/image/ab67616d0000b273b06c09b9f72389ee7f1cbd6b",
  },
  {
    title: "Friday (feat. Mufasa & Hypeman) - Dopamine Re-Edit",
    artist: "Riton",
    image:
      "https://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:7vdlgi2bflelz7mmuxoqjfcr/bafkreihvqfivhiaxj4cxkwfptzdxwnrwkqsasuirxi5ub3mgyxzgi4yc7i@jpeg",
  },
  {
    title: "Hear Me Say",
    artist: "Jonas Blue",
    image:
      "https://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:7vdlgi2bflelz7mmuxoqjfcr/bafkreigjwz3opdzwdeispeckym2gpiy4kixp4skz2gdelckujkbnkz3edm@jpeg",
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

const RecentTracksWithData = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  return (
    <RecentTracks
      tracks={recents}
      onSeeAll={() => navigation.navigate("UserLibrary")}
      onPressTrack={() => navigation.navigate("SongDetails")}
      onPressAlbum={() => navigation.navigate("AlbumDetails")}
    />
  );
};

export default RecentTracksWithData;
