import Song from "@/src/components/Song";
import StickyPlayer from "@/src/components/StickyPlayer";
import { RootStackParamList } from "@/src/Navigation";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import React from "react";
import { ScrollView, Text, View } from "react-native";
import Stories from "./Stories";

const recents = [
  {
    title: "Work from Home (feat. Ty Dolla $ign)",
    artist: "Fith Harmony",
    image:
      "https://cdn.rocksky.app/covers/cbed73745681d6a170b694ee11bb527c.jpg",
  },
  {
    title: "BED - THAT KIND Remix",
    artist: "Joel Corry",
    image:
      "https://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:7vdlgi2bflelz7mmuxoqjfcr/bafkreic44lr3hnftk7fmdqetxyoxx6sww5rvynvqefl22up52w3k6ltwta@jpeg",
  },
  {
    title: "OUT OUT (feat. Charli XCX & Saweetie)",
    artist: "Joel Corry",
    image:
      "https://cdn.rocksky.app/covers/ec9bbc208b04182f315f8137cfb2125b.jpg",
  },
  {
    title: "Intoxicated - Edit",
    artist: "Martin Solveig",
    image:
      "https://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:7vdlgi2bflelz7mmuxoqjfcr/bafkreibwcac7gx2o2iwfiy3ftdq5j3o7ncva6h2kc36rjtrnwexnmdfrly@jpeg",
  },
  {
    title: "Aftertaste",
    artist: "Loud Luxury",
    image:
      "https://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:7vdlgi2bflelz7mmuxoqjfcr/bafkreicwddxl3ntt3tiimrevbip2ustt2564pvasrrmizsnjeisqypl72a@jpeg",
  },
];

const Home = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  return (
    <View className="h-full w-full bg-black">
      <ScrollView className="h-[99%] w-full pl-[15px] pr-[15px] pt-[50px]">
        <Stories />
        <Text className="font-rockford-medium text-white text-[21px] mb-[10px] mt-[30px]">
          Recently Played
        </Text>
        {recents.map((song, index) => (
          <Song
            key={index}
            image={song.image}
            title={song.title}
            artist={song.artist}
            listenerHandle="@tsiry-sandratraina.com"
            className="mb-[15px]"
            borderRadius={5}
            listeningDate="8m"
            onPress={(did) => navigation.navigate("SongDetails")}
            onOpenBlueskyProfile={() => navigation.navigate("UserProfile")}
            onPressAlbum={() => navigation.navigate("AlbumDetails")}
            did=""
          />
        ))}
      </ScrollView>
      <View className="w-full absolute bottom-0 bg-[#000]">
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

export default Home;
