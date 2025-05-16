import Song from "@/src/components/Song";
import StickyPlayer from "@/src/components/StickyPlayer";
import { ScrollView, View } from "react-native";
import SearchInput from "./SearchInput";

const tracks = [
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

const Search = () => {
  return (
    <View className="w-full h-full bg-black">
      <SearchInput className="mt-[50px] ml-[15px] mr-[15px]" />
      <ScrollView className="h-[99%] w-full mt-[10px] pl-[15px] pr-[15px]">
        {tracks.map((song, index) => (
          <Song
            key={index}
            image={song.image}
            title={song.title}
            artist={song.artist}
            size={60}
            className="mt-[10px]"
            onPress={() => {}}
            onPressAlbum={() => {}}
            did=""
            albumUri=""
          />
        ))}
      </ScrollView>
      <View className="w-full absolute bottom-0 bg-black">
        <StickyPlayer
          isPlaying={true}
          onPlay={() => {}}
          onPause={() => {}}
          progress={50}
          song={{
            title: "Tyler Herro",
            artist: "Jack Harlow",
            cover:
              "https://i.scdn.co/image/ab67616d0000b273aeb14ead136118a987246b63",
          }}
        />
      </View>
    </View>
  );
};

export default Search;
