import Feather from "@expo/vector-icons/Feather";
import { type NavigationProp, useNavigation } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { LinearGradient } from "expo-linear-gradient";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  feedAtom,
  feedGeneratorUriAtom,
  feedUrisAtom,
  followingFeedAtom,
} from "@/src/atoms/feed";
import { Text } from "@/src/components/Text";
import {
  useFeedGeneratorsQuery,
  useFeedInfiniteQuery,
  useScrobbleInfiniteQuery,
} from "@/src/hooks/useFeed";
import TrackLikeButton from "@/src/components/TrackLikeButton";
import type { RootStackParamList } from "@/src/Navigation";
import { storage } from "@/src/storage";
import { colors } from "@/src/theme";
import type { FeedScrobble } from "@/src/types/feed";
import Stories from "./Stories";

dayjs.extend(relativeTime);

const SCREEN_WIDTH = Dimensions.get("window").width;
const CARD_SIZE = (SCREEN_WIDTH - 48) / 2;

// Genre chips shown only when a matching feed generator exists (§3.1).
const GENRES = [
  "afrobeat",
  "afrobeats",
  "alternative metal",
  "anime",
  "art pop",
  "breakcore",
  "chicago drill",
  "chillwave",
  "country hip hop",
  "crunk",
  "dance pop",
  "deep house",
  "drill",
  "dubstep",
  "emo",
  "grunge",
  "hard rock",
  "heavy metal",
  "hip hop",
  "house",
  "hyperpop",
  "indie",
  "indie rock",
  "j-pop",
  "j-rock",
  "jazz",
  "k-pop",
  "lo-fi",
  "metal",
  "metalcore",
  "midwest emo",
  "nu metal",
  "pop punk",
  "post-grunge",
  "rap",
  "rap metal",
  "r&b",
  "rock",
  "southern hip hop",
  "speedcore",
  "swedish pop",
  "synthwave",
  "thrash metal",
  "trap",
  "trap soul",
  "tropical house",
  "vaporwave",
  "visual kei",
  "vocaloid",
  "west coast hip hop",
];

function FeedGenerators() {
  const isLoggedIn = !!storage.getDid();
  const { data: feedGenerators } = useFeedGeneratorsQuery();
  const [feedUris, setFeedUris] = useAtom(feedUrisAtom);
  const setFeedUri = useSetAtom(feedGeneratorUriAtom);
  const setFollowingFeed = useSetAtom(followingFeedAtom);
  const [activeCategory, setActiveCategory] = useAtom(feedAtom);

  useEffect(() => {
    if (!feedGenerators?.feeds) return;
    const uriMap: Record<string, string> = {};
    for (const feed of feedGenerators.feeds) {
      uriMap[feed.name.toLowerCase()] = feed.uri;
    }
    setFeedUris(uriMap);
    if (activeCategory !== "following") {
      setFeedUri(uriMap[activeCategory] ?? uriMap.all ?? "");
    }
  }, [feedGenerators, activeCategory, setFeedUri, setFeedUris]);

  const categories = [
    "all",
    ...(isLoggedIn ? ["following"] : []),
    ...GENRES.filter((genre) => !!feedUris[genre]),
  ];

  const handlePress = (category: string) => {
    setActiveCategory(category);
    if (category === "following") {
      setFollowingFeed(true);
      return;
    }
    setFeedUri(feedUris[category] ?? feedUris.all ?? "");
    setFollowingFeed(false);
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingVertical: 8,
        gap: 8,
        flexDirection: "row",
      }}
    >
      {categories.map((category) => {
        const active = activeCategory === category;
        return (
          <TouchableOpacity
            key={category}
            onPress={() => handlePress(category)}
            style={{
              paddingHorizontal: 14,
              paddingTop: 8,
              paddingBottom: 4,
              borderRadius: 20,
              backgroundColor: active ? colors.surface2 : "transparent",
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: 13,
                color: active ? colors.text : colors.textMuted,
                fontWeight: active ? "600" : "400",
                textTransform: "capitalize",
              }}
            >
              {category}
            </Text>
            <View
              style={{
                width: 32,
                height: 2,
                borderRadius: 1,
                marginTop: 4,
                backgroundColor: active ? colors.primary : "transparent",
              }}
            />
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function SongCard({
  item,
  onPress,
  onPressProfile,
}: {
  item: FeedScrobble;
  onPress: (uri: string) => void;
  onPressProfile: (didOrHandle: string) => void;
}) {
  return (
    <TouchableOpacity
      style={{ width: CARD_SIZE, marginBottom: 16 }}
      onPress={() => item.uri && onPress(item.uri)}
      activeOpacity={0.8}
    >
      <View
        style={{
          width: CARD_SIZE,
          height: CARD_SIZE,
          borderRadius: 12,
          overflow: "hidden",
          backgroundColor: colors.surface2,
          marginBottom: 6,
        }}
      >
        {item.cover ? (
          <Image
            source={{ uri: item.cover }}
            style={{ width: CARD_SIZE, height: CARD_SIZE }}
          />
        ) : (
          <View
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ fontSize: 32, opacity: 0.2, color: colors.text }}>
              ♪
            </Text>
          </View>
        )}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.75)"]}
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            flexDirection: "row",
            alignItems: "flex-end",
            paddingHorizontal: 10,
            paddingTop: 28,
            paddingBottom: 8,
          }}
          pointerEvents="box-none"
        >
          <TrackLikeButton
            track={item}
            showCount
            color="rgba(255,255,255,0.9)"
          />
        </LinearGradient>
      </View>
      <Text
        numberOfLines={1}
        style={{
          fontSize: 14,
          fontWeight: "600",
          color: colors.text,
          marginBottom: 2,
        }}
      >
        {item.title}
      </Text>
      <Text
        numberOfLines={1}
        style={{ fontSize: 12, color: colors.textMuted, marginBottom: 4 }}
      >
        {item.artist}
      </Text>
      {!!item.tags?.length && (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 4,
            marginBottom: 4,
          }}
        >
          {item.tags.slice(0, 2).map((genre) => (
            <Text
              key={genre}
              numberOfLines={1}
              style={{ fontSize: 10, color: colors.genre }}
            >
              #{genre}
            </Text>
          ))}
        </View>
      )}
      <TouchableOpacity
        onPress={() => item.user && onPressProfile(item.user)}
        style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
      >
        {item.userAvatar && !item.userAvatar.endsWith("/@jpeg") ? (
          <Image
            source={{ uri: item.userAvatar }}
            style={{ width: 14, height: 14, borderRadius: 7 }}
          />
        ) : (
          <View
            style={{
              width: 14,
              height: 14,
              borderRadius: 7,
              backgroundColor: colors.avatarBackground,
            }}
          />
        )}
        <Text
          numberOfLines={1}
          style={{ fontSize: 10, color: colors.primary, flexShrink: 1 }}
        >
          {item.userDisplayName || item.user}
        </Text>
        <Text style={{ fontSize: 10, color: colors.textMuted }}>
          · {dayjs(item.date).fromNow()}
        </Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

function FeedSkeleton() {
  return (
    <View style={{ paddingHorizontal: 16 }}>
      {[0, 1, 2].map((row) => (
        <View
          key={row}
          style={{ flexDirection: "row", gap: 16, marginBottom: 16 }}
        >
          {[0, 1].map((col) => (
            <View key={col} style={{ width: CARD_SIZE }}>
              <View
                style={{
                  width: CARD_SIZE,
                  height: CARD_SIZE,
                  borderRadius: 12,
                  backgroundColor: colors.surface2,
                  marginBottom: 8,
                }}
              />
              <View
                style={{
                  width: "80%",
                  height: 12,
                  borderRadius: 6,
                  backgroundColor: colors.surface2,
                  marginBottom: 6,
                }}
              />
              <View
                style={{
                  width: "55%",
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: colors.surface2,
                }}
              />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

export default function Home() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();
  const feedUri = useAtomValue(feedGeneratorUriAtom);
  const followingFeed = useAtomValue(followingFeedAtom);
  const did = storage.getDid() || "";
  const flatListRef = useRef<FlatList<FeedScrobble>>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const isButtonVisible = useRef(false);
  const [refreshing, setRefreshing] = useState(false);

  const onScroll = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number } } }) => {
      const y = e.nativeEvent.contentOffset.y;
      const isVisible = y > 300;
      if (isVisible !== isButtonVisible.current) {
        isButtonVisible.current = isVisible;
        Animated.timing(fadeAnim, {
          toValue: isVisible ? 1 : 0,
          duration: 200,
          useNativeDriver: true,
        }).start();
      }
    },
    [fadeAnim],
  );

  const {
    data: feedData,
    isLoading: feedLoading,
    fetchNextPage: fetchFeed,
    hasNextPage: hasFeed,
    isFetchingNextPage: fetchingFeed,
    refetch: refetchFeed,
  } = useFeedInfiniteQuery(feedUri, 20);

  const {
    data: scrobbleData,
    isLoading: scrobbleLoading,
    fetchNextPage: fetchScrobble,
    hasNextPage: hasScrobble,
    isFetchingNextPage: fetchingScrobble,
    refetch: refetchScrobble,
  } = useScrobbleInfiniteQuery(did, true, 20);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        followingFeed ? refetchScrobble() : refetchFeed(),
        queryClient.refetchQueries({ queryKey: ["stories"] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [followingFeed, refetchFeed, refetchScrobble, queryClient]);

  const songs: FeedScrobble[] = followingFeed
    ? (scrobbleData?.pages.flatMap((p) => p.scrobbles) ?? [])
    : (feedData?.pages.flatMap((p) => p.feed) ?? []);

  const loading = followingFeed ? scrobbleLoading : !feedUri || feedLoading;

  const onEndReached = useCallback(() => {
    if (followingFeed) {
      if (!fetchingScrobble && hasScrobble) fetchScrobble();
    } else {
      if (!fetchingFeed && hasFeed) fetchFeed();
    }
  }, [
    followingFeed,
    fetchingFeed,
    hasFeed,
    fetchFeed,
    fetchingScrobble,
    hasScrobble,
    fetchScrobble,
  ]);

  const onPressSong = useCallback(
    (uri: string) => {
      navigation.navigate("SongDetails", { uri });
    },
    [navigation],
  );

  const onPressProfile = useCallback(
    (didOrHandle: string) => {
      if (didOrHandle.startsWith("did:")) {
        navigation.navigate("UserProfile", { did: didOrHandle });
      } else {
        navigation.navigate("UserProfile", { handle: didOrHandle });
      }
    },
    [navigation],
  );

  const renderItem = useCallback(
    ({ item }: { item: FeedScrobble }) => (
      <SongCard
        item={item}
        onPress={onPressSong}
        onPressProfile={onPressProfile}
      />
    ),
    [onPressSong, onPressProfile],
  );

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={["top", "left", "right"]}
    >
      <FlatList
        ref={flatListRef}
        data={songs}
        numColumns={2}
        keyExtractor={(item, index) => `${item.id ?? item.uri}-${index}`}
        renderItem={renderItem}
        columnWrapperStyle={{ paddingHorizontal: 16, gap: 16 }}
        ListHeaderComponent={
          <>
            <TouchableOpacity
              accessibilityLabel="Open listening analytics"
              onPress={() => navigation.navigate("Analytics")}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: 8,
                paddingHorizontal: 20,
                paddingVertical: 12,
              }}
            >
              <Feather name="activity" color={colors.primary} size={18} />
              <Text style={{ color: colors.primary, fontSize: 13 }}>
                Listening analytics
              </Text>
            </TouchableOpacity>
            <Stories />
            <FeedGenerators />
          </>
        }
        ListFooterComponent={
          fetchingFeed || fetchingScrobble ? (
            <View style={{ paddingVertical: 16, alignItems: "center" }}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          loading ? (
            <FeedSkeleton />
          ) : (
            <View
              style={{
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 80,
                paddingHorizontal: 32,
              }}
            >
              <Text
                style={{
                  fontSize: 40,
                  opacity: 0.2,
                  marginBottom: 12,
                  color: colors.text,
                }}
              >
                ♪
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: colors.textMuted,
                  textAlign: "center",
                }}
              >
                {followingFeed
                  ? "No scrobbles from people you follow yet. Start following users!"
                  : "No songs in feed yet."}
              </Text>
            </View>
          )
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      />

      <Animated.View
        pointerEvents={refreshing ? "none" : "box-none"}
        style={{
          position: "absolute",
          bottom: 24,
          right: 20,
          opacity: fadeAnim,
        }}
      >
        <TouchableOpacity
          onPress={() =>
            flatListRef.current?.scrollToOffset({ offset: 0, animated: true })
          }
          style={{
            width: 54,
            height: 54,
            borderRadius: 27,
            backgroundColor: colors.primary,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.35,
            shadowRadius: 6,
            elevation: 8,
          }}
        >
          <Feather name="arrow-up" size={26} color="#fff" />
        </TouchableOpacity>
      </Animated.View>
    </SafeAreaView>
  );
}
