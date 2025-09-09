import ScrollToTopButton from "@/src/components/ScrollToTopButton";
import Song from "@/src/components/Song";
import StickyPlayer from "@/src/components/StickyPlayer";
import { useFeedInfiniteQuery } from "@/src/hooks/useFeed";
import useScrollToTop from "@/src/hooks/useScrollToTop";
import { RootStackParamList } from "@/src/Navigation";
import { useNowPlayingContext } from "@/src/providers/NowPlayingProvider";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import updateLocale from "dayjs/plugin/updateLocale";
import * as R from "ramda";
import React, { memo, useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Text, View } from "react-native";
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
    MM: "%dmo",
    y: "1y",
    yy: "%dy",
  },
});

const FooterLoader = memo(({ isLoading }: { isLoading: boolean }) => (
  <View className="flex-row justify-center items-center mt-2 h-[80px]">
    {isLoading && <ActivityIndicator size="large" color="#A0A0A0" />}
  </View>
));

const Header = memo(() => (
  <View className="w-full bg-black mt-[50px]">
    <Stories />
    <Text className="font-rockford-medium text-white text-[21px] mb-[10px] mt-[30px]">
      Recently Played
    </Text>
  </View>
));

const SongItem = memo(({ item, onPress, openProfile, onPressAlbum }: any) => (
  <Song
    key={item.id}
    image={item.cover}
    title={item.title}
    artist={item.artist}
    listenerHandle={item.user}
    className="mb-[15px]"
    borderRadius={5}
    listeningDate={dayjs(item.date).fromNow()}
    onPress={() => onPress(item.uri)}
    onOpenProfile={(handle) => openProfile(handle)}
    onPressAlbum={() => onPressAlbum(item.albumUri)}
    did={item.uri}
    albumUri={item.albumUri}
  />
));

const Home = () => {
  const [refreshing, setRefreshing] = useState(false);
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useFeedInfiniteQuery(20);
  const nowPlaying = useNowPlayingContext();
  const { scrollToTop, isVisible, fadeAnim, handleScroll, listRef } =
    useScrollToTop();

  const handleEndReached = useCallback(() => {
    if (!isFetchingNextPage && hasNextPage) {
      fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const feed = useMemo(() => {
    if (!data) return [];

    // Create a stable reference to the processed data
    return R.uniqBy(
      R.prop("id"),
      data.pages
        .flatMap((page) => page.feed)
        .map((item) => ({
          id: item.id,
          cover: item.cover,
          title: item.title,
          artist: item.artist,
          user: item.user,
          date: item.date,
          uri: item.uri,
          albumUri: item.albumUri,
        })),
    );
  }, [data?.pages]); // Only depend on data.pages instead of all of data

  const handleSongPress = useCallback(
    (uri: string) => navigation.navigate("SongDetails", { uri }),
    [navigation],
  );

  const handleProfilePress = useCallback(
    (handle: string) => navigation.navigate("UserProfile", { handle }),
    [navigation],
  );

  const handleAlbumPress = useCallback(
    (uri: string) => navigation.navigate("AlbumDetails", { uri }),
    [navigation],
  );

  const renderItem = useCallback(
    ({ item }: any) => (
      <SongItem
        item={item}
        onPress={handleSongPress}
        openProfile={handleProfilePress}
        onPressAlbum={handleAlbumPress}
      />
    ),
    [handleSongPress, handleProfilePress, handleAlbumPress],
  );

  const renderFooter = useCallback(
    () => <FooterLoader isLoading={isLoading || isFetchingNextPage} />,
    [isLoading, isFetchingNextPage],
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  }, [refetch]);

  const bottomPadding = nowPlaying ? "mb-[60px]" : "";
  const bottomButtonPosition = nowPlaying ? 80 : 20;

  return (
    <View className="h-full w-full bg-black">
      <View className={`pl-[15px] pr-[15px] ${bottomPadding}`}>
        <FlatList
          data={feed}
          ref={listRef}
          initialNumToRender={10}
          maxToRenderPerBatch={5}
          updateCellsBatchingPeriod={50}
          windowSize={21}
          removeClippedSubviews={true}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          onEndReached={handleEndReached}
          onRefresh={handleRefresh}
          refreshing={refreshing}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={Header}
          ListFooterComponent={renderFooter}
          renderItem={renderItem}
          onScroll={handleScroll}
        />
      </View>
      {isVisible && (
        <ScrollToTopButton
          fadeAnim={fadeAnim}
          bottom={bottomButtonPosition}
          onPress={scrollToTop}
        />
      )}

      <View className="w-full absolute bottom-0 bg-[#000]">
        <StickyPlayer />
      </View>
    </View>
  );
};

export default Home;
