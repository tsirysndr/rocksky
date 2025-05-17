import Song from "@/src/components/Song";
import StickyPlayer from "@/src/components/StickyPlayer";
import { useFeedQuery } from "@/src/hooks/useFeed";
import { RootStackParamList } from "@/src/Navigation";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import updateLocale from "dayjs/plugin/updateLocale";
import React from "react";
import { ScrollView, Text, View } from "react-native";
import Stories from "./Stories";

dayjs.extend(relativeTime);
dayjs.extend(updateLocale);

dayjs.updateLocale("en", {
  relativeTime: {
    future: "in %s",
    past: "%s",
    s: "%ds",
    m: "1min",
    mm: "%dm",
    h: "1h",
    hh: "%dh",
    d: "1d",
    dd: "%dd",
    M: "%dd",
  },
});

const Home = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { data, isLoading } = useFeedQuery();
  return (
    <View className="h-full w-full bg-black">
      <ScrollView
        className="h-[99%] w-full  pt-[50px]"
        showsVerticalScrollIndicator={false}
      >
        <Stories />
        <View className="pl-[15px] pr-[15px]">
          {!isLoading && (
            <>
              <Text className="font-rockford-medium text-white text-[21px] mb-[10px] mt-[30px]">
                Recently Played
              </Text>
              {data?.map((song: any, index: number) => (
                <Song
                  key={index}
                  image={song.cover}
                  title={song.title}
                  artist={song.artist}
                  listenerHandle={song.user}
                  className="mb-[15px]"
                  borderRadius={5}
                  listeningDate={dayjs(song.date).fromNow()}
                  onPress={() =>
                    navigation.navigate("SongDetails", { uri: song.uri })
                  }
                  onOpenProfile={(handle) =>
                    navigation.navigate("UserProfile", { handle })
                  }
                  onPressAlbum={() =>
                    navigation.navigate("AlbumDetails", { uri: song.albumUri })
                  }
                  did={song.uri}
                  albumUri={song.albumUri}
                />
              ))}
            </>
          )}
        </View>
      </ScrollView>
      <View className="w-full absolute bottom-0 bg-[#000]">
        <StickyPlayer />
      </View>
    </View>
  );
};

export default Home;
