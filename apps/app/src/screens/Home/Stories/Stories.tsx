import { useStoriesQuery, Story } from "@/src/hooks/useStories";
import { colors } from "@/src/theme";
import { RootStackParamList } from "@/src/Navigation";
import { NavigationProp } from "@react-navigation/native";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import utc from "dayjs/plugin/utc";
import { Image } from "expo-image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Modal,
  TouchableOpacity,
  View,
  Animated,
} from "react-native";
import { Text } from "@/src/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";

dayjs.extend(relativeTime);
dayjs.extend(utc);

const { width: SCREEN_WIDTH } = Dimensions.get("window");

function StoryModal({
  stories,
  startIndex,
  onClose,
  navigation,
}: {
  stories: Story[];
  startIndex: number;
  onClose: () => void;
  navigation: NavigationProp<RootStackParamList>;
}) {
  const [index, setIndex] = useState(startIndex);
  const progress = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const current = stories[index];

  const startProgress = useCallback(() => {
    progress.setValue(0);
    animRef.current?.stop();
    animRef.current = Animated.timing(progress, {
      toValue: 1,
      duration: 10000,
      useNativeDriver: false,
    });
    animRef.current.start(({ finished }) => {
      if (finished) {
        if (index + 1 >= stories.length) onClose();
        else setIndex((i) => i + 1);
      }
    });
  }, [index, stories.length]);

  useEffect(() => {
    startProgress();
    return () => animRef.current?.stop();
  }, [index]);

  const goNext = () => {
    if (index + 1 >= stories.length) { onClose(); return; }
    setIndex((i) => i + 1);
  };

  const goPrev = () => {
    if (index === 0) return;
    setIndex((i) => i - 1);
  };

  const onPressTrack = () => {
    if (!current?.trackUri) return;
    onClose();
    setTimeout(() => navigation.navigate("SongDetails", { uri: current.trackUri }), 100);
  };

  const onPressUser = () => {
    if (!current?.did) return;
    onClose();
    setTimeout(() => navigation.navigate("UserProfile", { did: current.did }), 100);
  };

  return (
    <Modal visible animationType="fade" statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        {current?.albumArt && (
          <Image
            source={current.albumArt}
            style={{ position: "absolute", width: "100%", height: "100%", opacity: 0.3 }}
            blurRadius={20}
            contentFit="cover"
          />
        )}
        <SafeAreaView style={{ flex: 1 }}>
          {/* Progress bars */}
          <View style={{ flexDirection: "row", gap: 4, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6 }}>
            {stories.map((_, i) => (
              <View key={i} style={{ flex: 1, height: 2, borderRadius: 1, backgroundColor: "rgba(255,255,255,0.3)", overflow: "hidden" }}>
                <Animated.View
                  style={{
                    height: "100%",
                    backgroundColor: "#fff",
                    borderRadius: 1,
                    width: i < index
                      ? "100%"
                      : i === index
                        ? progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] })
                        : "0%",
                  }}
                />
              </View>
            ))}
          </View>

          {/* Header */}
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 8, gap: 8 }}>
            <TouchableOpacity onPress={onPressUser} style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, overflow: "hidden", backgroundColor: colors.avatarBackground }}>
                {current?.avatar && (
                  <Image source={current.avatar} style={{ width: 36, height: 36 }} contentFit="cover" />
                )}
              </View>
              <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>@{current?.handle}</Text>
              <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 11 }}>
                {dayjs.utc(current?.createdAt).local().fromNow()}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={{ padding: 6 }}>
              <Text style={{ color: "#fff", fontSize: 18 }}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Album art with tap zones */}
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <TouchableOpacity
              style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "33%", zIndex: 10 }}
              onPress={goPrev}
              activeOpacity={1}
            />
            <TouchableOpacity
              style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "33%", zIndex: 10 }}
              onPress={goNext}
              activeOpacity={1}
            />
            <TouchableOpacity onPress={onPressTrack} activeOpacity={0.9}>
              {current?.albumArt ? (
                <Image
                  source={current.albumArt}
                  style={{
                    width: Math.min(SCREEN_WIDTH * 0.75, 340),
                    height: Math.min(SCREEN_WIDTH * 0.75, 340),
                    borderRadius: 16,
                  }}
                  contentFit="cover"
                />
              ) : (
                <View style={{
                  width: Math.min(SCREEN_WIDTH * 0.75, 340),
                  height: Math.min(SCREEN_WIDTH * 0.75, 340),
                  borderRadius: 16,
                  backgroundColor: colors.surface2,
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  <Text style={{ fontSize: 80, opacity: 0.2 }}>♪</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Track info */}
          <View style={{ paddingHorizontal: 24, paddingBottom: 40, paddingTop: 16, alignItems: "center" }}>
            <TouchableOpacity onPress={onPressTrack}>
              <Text style={{ color: "#fff", fontSize: 20, fontWeight: "700", textAlign: "center", marginBottom: 4 }}>
                {current?.title}
              </Text>
            </TouchableOpacity>
            <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 15, textAlign: "center" }}>
              {current?.artist}
            </Text>
            <View style={{ flexDirection: "row", gap: 40, marginTop: 20 }}>
              <TouchableOpacity onPress={goPrev} disabled={index === 0} style={{ opacity: index === 0 ? 0.3 : 1, padding: 10 }}>
                <Text style={{ color: "#fff", fontSize: 28 }}>‹</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={goNext} disabled={index >= stories.length - 1} style={{ opacity: index >= stories.length - 1 ? 0.3 : 1, padding: 10 }}>
                <Text style={{ color: "#fff", fontSize: 28 }}>›</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

export default function Stories({ navigation }: { navigation: NavigationProp<RootStackParamList> }) {
  const { data: rawStories, isLoading } = useStoriesQuery();
  const [modalIndex, setModalIndex] = useState<number | null>(null);

  const stories = rawStories
    ? [...new Map(rawStories.map((s) => [`${s.trackId}-${s.did}-${s.createdAt}`, s])).values()]
    : [];

  if (isLoading || !stories.length) return null;

  return (
    <>
      <FlatList
        horizontal
        data={stories}
        keyExtractor={(item, i) => `${item.id}-${item.did}-${i}`}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, gap: 16 }}
        renderItem={({ item, index }) => (
          <TouchableOpacity
            onPress={() => setModalIndex(index)}
            style={{ alignItems: "center", width: 68 }}
          >
            <View style={{
              width: 60,
              height: 60,
              borderRadius: 30,
              borderWidth: 2,
              borderColor: colors.primary,
              padding: 2,
              marginBottom: 4,
            }}>
              <View style={{ flex: 1, borderRadius: 28, overflow: "hidden", backgroundColor: colors.avatarBackground }}>
                {item.avatar && (
                  <Image source={item.avatar} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                )}
              </View>
            </View>
            <Text numberOfLines={1} style={{ fontSize: 10, color: colors.textMuted, width: "100%", textAlign: "center" }}>
              {item.handle}
            </Text>
          </TouchableOpacity>
        )}
      />

      {modalIndex !== null && (
        <StoryModal
          stories={stories}
          startIndex={modalIndex}
          onClose={() => setModalIndex(null)}
          navigation={navigation}
        />
      )}
    </>
  );
}
