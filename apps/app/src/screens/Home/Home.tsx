import { feedAtom, feedGeneratorUriAtom, feedUrisAtom, followingFeedAtom } from "@/src/atoms/feed";
import { colors } from "@/src/theme";
import { useFeedGeneratorsQuery, useFeedInfiniteQuery, useScrobbleInfiniteQuery } from "@/src/hooks/useFeed";
import { RootStackParamList } from "@/src/Navigation";
import { storage } from "@/src/storage";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import Feather from "@expo/vector-icons/Feather";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { Text } from "@/src/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import Stories from "./Stories";

dayjs.extend(relativeTime);

const SCREEN_WIDTH = Dimensions.get("window").width;
const CARD_SIZE = (SCREEN_WIDTH - 48) / 2;

const ALL_CATEGORIES = [
  "all", "following", "afrobeat", "afrobeats", "alternative metal", "anime",
  "art pop", "breakcore", "chicago drill", "chillwave", "country hip hop",
  "dance pop", "deep house", "drill", "dubstep", "emo", "grunge", "hard rock",
  "heavy metal", "hip hop", "house", "hyperpop", "indie", "indie rock",
  "j-pop", "j-rock", "jazz", "k-pop", "lo-fi", "metal", "metalcore",
  "midwest emo", "nu metal", "pop punk", "post-grunge", "rap", "r&b", "rock",
  "southern hip hop", "synthwave", "trap", "trap soul", "tropical house",
  "vaporwave", "west coast hip hop",
];

function FeedGenerators() {
  const isLoggedIn = !!storage.getDid();
  const categories = ALL_CATEGORIES.filter((c) => isLoggedIn || c !== "following");
  const { data: feedGenerators } = useFeedGeneratorsQuery();
  const [feedUris, setFeedUris] = useAtom(feedUrisAtom);
  const [, setFeedUri] = useAtom(feedGeneratorUriAtom);
  const [, setFollowingFeed] = useAtom(followingFeedAtom);
  const [activeCategory, setActiveCategory] = useAtom(feedAtom);

  useEffect(() => {
    if (!feedGenerators?.feeds) return;
    const uriMap: Record<string, string> = {};
    feedGenerators.feeds.forEach((x: { name: string; uri: string }) => {
      const name = x.name.toLowerCase();
      if (categories.includes(name)) uriMap[name] = x.uri;
    });
    setFeedUris(uriMap);
    if (activeCategory !== "following" && uriMap[activeCategory]) {
      setFeedUri(uriMap[activeCategory]);
    } else if (uriMap["all"]) {
      setFeedUri(uriMap["all"]);
    }
  }, [feedGenerators]);

  const handlePress = (category: string) => {
    setActiveCategory(category);
    if (category === "following") {
      setFollowingFeed(true);
    } else {
      setFeedUri(feedUris[category] || feedUris["all"]);
      setFollowingFeed(false);
    }
  };

  return (
    <View style={{ }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8, flexDirection: "row" }}
      >
        {categories.map((category) => (
          <TouchableOpacity
            key={category}
            onPress={() => handlePress(category)}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 20,
              backgroundColor: activeCategory === category ? colors.surface2 : "transparent",
            }}
          >
            <Text style={{
              fontSize: 13,
              color: activeCategory === category ? colors.text : colors.textMuted,
              fontWeight: activeCategory === category ? "600" : "400",
              textTransform: "capitalize",
            }}>
              {category}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function SongCard({ item, onPress, onPressProfile }: {
  item: any;
  onPress: (uri: string) => void;
  onPressProfile: (did: string) => void;
}) {
  return (
    <TouchableOpacity
      style={{ width: CARD_SIZE, marginBottom: 16 }}
      onPress={() => item.uri && onPress(item.uri)}
      activeOpacity={0.8}
    >
      <View style={{
        width: CARD_SIZE,
        height: CARD_SIZE,
        borderRadius: 12,
        overflow: "hidden",
        backgroundColor: colors.surface2,
        marginBottom: 6,
      }}>
        {item.cover ? (
          <Image source={{ uri: item.cover }} style={{ width: CARD_SIZE, height: CARD_SIZE }} />
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 32, opacity: 0.2 }}>♪</Text>
          </View>
        )}
      </View>
      <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "600", color: colors.text, marginBottom: 2 }}>
        {item.title}
      </Text>
      <Text numberOfLines={1} style={{ fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>
        {item.artist}
      </Text>
      {item.tags && item.tags.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
          {(item.tags as string[]).slice(0, 2).map((genre) => (
            <Text key={genre} style={{ fontSize: 10, color: colors.genre }}>#{genre}</Text>
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
          <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: colors.avatarBackground }} />
        )}
        <Text numberOfLines={1} style={{ fontSize: 10, color: colors.primary, flex: 1 }}>
          {item.userDisplayName || item.user}
        </Text>
        <Text style={{ fontSize: 10, color: colors.textMuted }}>
          · {dayjs(item.date).fromNow()}
        </Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

export default function Home() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const feedUri = useAtomValue(feedGeneratorUriAtom);
  const followingFeed = useAtomValue(followingFeedAtom);
  const did = storage.getDid() || "";
  const flatListRef = useRef<FlatList>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const isButtonVisible = useRef(false);
  const [refreshing, setRefreshing] = useState(false);

  const onScroll = useCallback((e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    const wasVisible = isButtonVisible.current;
    const isVisible = y > 300;
    if (isVisible !== wasVisible) {
      isButtonVisible.current = isVisible;
      Animated.timing(fadeAnim, {
        toValue: isVisible ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [fadeAnim]);

  const { data: feedData, isLoading: feedLoading, fetchNextPage: fetchFeed, hasNextPage: hasFeed, isFetchingNextPage: fetchingFeed, refetch: refetchFeed } =
    useFeedInfiniteQuery(feedUri, 20);

  const { data: scrobbleData, isLoading: scrobbleLoading, fetchNextPage: fetchScrobble, hasNextPage: hasScrobble, isFetchingNextPage: fetchingScrobble, refetch: refetchScrobble } =
    useScrobbleInfiniteQuery(did, true, 20);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (followingFeed) {
        await refetchScrobble();
      } else {
        await refetchFeed();
      }
    } finally {
      setRefreshing(false);
    }
  }, [followingFeed, refetchFeed, refetchScrobble]);

  const songs = followingFeed
    ? scrobbleData?.pages.flatMap((p) => p.scrobbles) || []
    : feedData?.pages.flatMap((p) => p.feed) || [];

  const loading = feedLoading || scrobbleLoading;

  const onEndReached = useCallback(() => {
    if (followingFeed) {
      if (!fetchingScrobble && hasScrobble) fetchScrobble();
    } else {
      if (!fetchingFeed && hasFeed) fetchFeed();
    }
  }, [followingFeed, fetchingFeed, hasFeed, fetchingScrobble, hasScrobble]);

  const onPressSong = useCallback((uri: string) => {
    navigation.navigate("SongDetails", { uri });
  }, [navigation]);

  const onPressProfile = useCallback((did: string) => {
    navigation.navigate("UserProfile", { did });
  }, [navigation]);

  const ListHeader = useCallback(() => (
    <Stories navigation={navigation} />
  ), [navigation]);

  const renderItem = useCallback(({ item, index }: { item: any; index: number }) => {
    if (index % 2 === 0) {
      const next = songs[index + 1];
      return (
        <View style={{ flexDirection: "row", paddingHorizontal: 16, gap: 16 }}>
          <SongCard item={item} onPress={onPressSong} onPressProfile={onPressProfile} />
          {next ? (
            <SongCard item={next} onPress={onPressSong} onPressProfile={onPressProfile} />
          ) : (
            <View style={{ width: CARD_SIZE }} />
          )}
        </View>
      );
    }
    return null;
  }, [songs, onPressSong, onPressProfile]);

  const pairData = songs.filter((_, i) => i % 2 === 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top", "left", "right"]}>
      <FeedGenerators />
      <FlatList
        ref={flatListRef}
        data={pairData}
        keyExtractor={(_, index) => String(index)}
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={() =>
          (fetchingFeed || fetchingScrobble) ? (
            <View style={{ paddingVertical: 16, alignItems: "center" }}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : null
        }
        ListEmptyComponent={() =>
          !loading ? (
            <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 80, paddingHorizontal: 32 }}>
              <Text style={{ fontSize: 40, opacity: 0.2, marginBottom: 12 }}>♪</Text>
              <Text style={{ fontSize: 13, color: colors.textMuted, textAlign: "center" }}>
                {followingFeed
                  ? "No scrobbles from people you follow yet."
                  : "No songs in feed yet."}
              </Text>
            </View>
          ) : null
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 0 }}
        onRefresh={onRefresh}
        refreshing={refreshing}
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
          onPress={() => flatListRef.current?.scrollToOffset({ offset: 0, animated: true })}
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
