import ScrollToTopButton from "@/src/components/ScrollToTopButton";
import Song from "@/src/components/Song";
import StickyPlayer from "@/src/components/StickyPlayer";
import { useFeedInfiniteQuery } from "@/src/hooks/useFeed";
import useScrollToTop from "@/src/hooks/useScrollToTop";
import { RootStackParamList } from "@/src/Navigation";
import { useNowPlayingStatus } from "@/src/providers/NowPlayingProvider";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import updateLocale from "dayjs/plugin/updateLocale";
import * as R from "ramda";
import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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

const SongItem = memo(
  ({ item, onPress, openProfile, onPressAlbum }: any) => {
    const listeningDate = useMemo(
      () => dayjs(item.date).fromNow(),
      [item.date]
    );

    const handlePress = useCallback(
      () => onPress(item.uri),
      [onPress, item.uri]
    );
    const handleOpenProfile = useCallback(
      () => openProfile(item.user),
      [openProfile, item.user]
    );
    const handlePressAlbum = useCallback(
      () => onPressAlbum(item.albumUri),
      [onPressAlbum, item.albumUri]
    );

    return (
      <Song
        key={item.id}
        image={item.cover}
        title={item.title}
        artist={item.artist}
        listenerHandle={item.user}
        className="mb-[15px]"
        borderRadius={5}
        listeningDate={listeningDate}
        onPress={handlePress}
        onOpenProfile={handleOpenProfile}
        onPressAlbum={handlePressAlbum}
        did={item.uri}
        albumUri={item.albumUri}
      />
    );
  },
  (prevProps, nextProps) => {
    return prevProps.item.id === nextProps.item.id;
  }
);

const Wrapper = memo(({ children }: { children: React.ReactNode }) => {
  const { nowPlaying, isLoading } = useNowPlayingStatus();

  const bottomPadding = useMemo(
    () => (nowPlaying && !isLoading ? "mb-[60px]" : ""),
    [nowPlaying, isLoading]
  );

  return (
    <View className={`pl-[15px] pr-[15px] ${bottomPadding}`}>{children}</View>
  );
});

const ScrollButton = memo(() => {
  const { nowPlaying, isLoading } = useNowPlayingStatus();
  const { scrollToTop, isVisible, fadeAnim } = useScrollToTop();

  const bottomButtonPosition = useMemo(
    () => (nowPlaying && !isLoading ? 80 : 20),
    [nowPlaying, isLoading]
  );

  if (!isVisible) return null;

  return (
    <ScrollToTopButton
      fadeAnim={fadeAnim}
      bottom={bottomButtonPosition}
      onPress={scrollToTop}
    />
  );
});

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

  const hasNextPageRef = useRef(hasNextPage);
  const isFetchingNextPageRef = useRef(isFetchingNextPage);

  useEffect(() => {
    hasNextPageRef.current = hasNextPage;
    isFetchingNextPageRef.current = isFetchingNextPage;
  }, [hasNextPage, isFetchingNextPage]);

  const { handleScroll, listRef } = useScrollToTop();

  const handleEndReached = useCallback(() => {
    if (!isFetchingNextPageRef.current && hasNextPageRef.current) {
      fetchNextPage();
    }
  }, [fetchNextPage]);

  const feed = useMemo(() => {
    if (!data?.pages?.length) return [];

    try {
      return R.uniqBy(
        R.prop("id"),
        data.pages
          .flatMap((page) => page.feed || [])
          .map((item) => ({
            id: item.id,
            cover: item.cover,
            title: item.title,
            artist: item.artist,
            user: item.user,
            date: item.date,
            uri: item.uri,
            albumUri: item.albumUri,
          }))
      );
    } catch (error) {
      console.error("Error processing feed data:", error);
      return [];
    }
  }, [data?.pages]);

  const handleSongPress = useCallback(
    (uri: string) => navigation.navigate("SongDetails", { uri }),
    [navigation]
  );

  const handleProfilePress = useCallback(
    (handle: string) => navigation.navigate("UserProfile", { handle }),
    [navigation]
  );

  const handleAlbumPress = useCallback(
    (uri: string) => navigation.navigate("AlbumDetails", { uri }),
    [navigation]
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
    [handleSongPress, handleProfilePress, handleAlbumPress]
  );

  const renderFooter = useCallback(
    () => <FooterLoader isLoading={isLoading || isFetchingNextPage} />,
    [isLoading, isFetchingNextPage]
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } catch (error) {
      console.error("Error refreshing:", error);
    } finally {
      setTimeout(() => {
        setRefreshing(false);
      }, 1000);
    }
  }, [refetch]);

  const optimizedHandleScroll = useMemo(() => {
    let lastCallTime = 0;
    const throttleInterval = 100; // ms

    return (event: any) => {
      const now = Date.now();
      if (now - lastCallTime > throttleInterval) {
        lastCallTime = now;
        handleScroll(event);
      }
    };
  }, [handleScroll]);

  const songList = useMemo(
    () => (
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
        onScroll={optimizedHandleScroll}
      />
    ),
    [
      feed,
      renderFooter,
      renderItem,
      refreshing,
      handleEndReached,
      handleRefresh,
      optimizedHandleScroll,
    ]
  );

  return (
    <View className="h-full w-full bg-black">
      <Wrapper>{songList}</Wrapper>
      <ScrollButton />
      <View className="w-full absolute bottom-0 bg-[#000]">
        <StickyPlayer />
      </View>
    </View>
  );
};

export default Home;
