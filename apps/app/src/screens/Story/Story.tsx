import Feather from "@expo/vector-icons/Feather";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import utc from "dayjs/plugin/utc";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import {
  type FC,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  AppState,
  Linking,
  Animated,
  PanResponder,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Text } from "@/src/components/Text";
import MarqueeText from "@/src/components/MarqueeText";
import UserAvatar from "@/src/components/UserAvatar";
import TrackLikeButton from "@/src/components/TrackLikeButton";
import { colors } from "@/src/theme";
import type { Story as StoryItem } from "@/src/types/feed";

dayjs.extend(relativeTime);
dayjs.extend(utc);

import StoryLinks from "./StoryLinks";

const STORY_DURATION = 15000;

export type StoryProps = {
  stories: StoryItem[];
  index?: number;
  onOpenProfile: (did: string) => void;
  onPressArtist: (artistUri: string) => void;
  onPressTrack: (trackUri: string) => void;
  onClose: () => void;
  onShare: (story: StoryItem) => void;
  onAddShout: (story: StoryItem) => void;
  active: boolean;
};

const Story: FC<StoryProps> = ({
  stories,
  index: startIndex,
  onOpenProfile,
  onPressArtist,
  onPressTrack,
  onClose,
  onShare,
  onAddShout,
  active,
}) => {
  const layout = useWindowDimensions();
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => setForeground(state === "active"));
    return () => listener.remove();
  }, []);
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(
    Math.min(Math.max(startIndex ?? 0, 0), Math.max(stories.length - 1, 0)),
  );
  const progress = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const current = stories[index];
  const artSize = Math.min(layout.width * 0.8, layout.height * 0.45, 380);

  const startProgress = useCallback(() => {
    progress.setValue(0);
    animRef.current?.stop();
    animRef.current = Animated.timing(progress, {
      toValue: 1,
      duration: STORY_DURATION,
      useNativeDriver: false,
    });
    animRef.current.start(({ finished }) => {
      if (finished) {
        if (index + 1 >= stories.length) onClose();
        else setIndex((i) => i + 1);
      }
    });
  }, [index, stories.length, onClose, progress]);

  useEffect(() => {
    if (active && foreground) startProgress();
    else animRef.current?.stop();
    return () => animRef.current?.stop();
  }, [startProgress, active, foreground]);

  const goNext = useCallback(() => {
    setIndex((i) => {
      if (i + 1 >= stories.length) {
        onClose();
        return i;
      }
      return i + 1;
    });
  }, [stories.length, onClose]);

  const goPrev = useCallback(() => {
    setIndex((i) => (i === 0 ? i : i - 1));
  }, []);

  // Swipe left/up for the next story, right/down for the previous one —
  // taps still reach the tap zones because the responder only claims moves.
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_evt, gesture) =>
          Math.abs(gesture.dx) > 12 || Math.abs(gesture.dy) > 12,
        onPanResponderRelease: (_evt, gesture) => {
          const { dx, dy } = gesture;
          if (Math.abs(dx) >= Math.abs(dy)) {
            if (dx <= -50) goNext();
            else if (dx >= 50) goPrev();
            return;
          }
          if (dy <= -50) goNext();
          else if (dy >= 50) goPrev();
        },
      }),
    [goNext, goPrev],
  );

  if (!current) return null;

  return (
    <View
      style={{ flex: 1, backgroundColor: "#000" }}
      {...panResponder.panHandlers}
    >
      {!!current.albumArt && (
        <Image
          source={current.albumArt}
          style={{
            position: "absolute",
            width: "100%",
            height: "100%",
            opacity: 0.3,
          }}
          blurRadius={20}
          contentFit="cover"
        />
      )}
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6 }}>
          <View
            style={{
              height: 2,
              borderRadius: 1,
              backgroundColor: "rgba(255,255,255,0.3)",
              overflow: "hidden",
            }}
          >
            <Animated.View
              style={{
                height: "100%",
                backgroundColor: "#fff",
                borderRadius: 1,
                width: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0%", "100%"],
                }),
              }}
            />
          </View>
        </View>
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingVertical: 8,
            gap: 8,
          }}
        >
          <TouchableOpacity
            onPress={() => current.did && onOpenProfile(current.did)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              flex: 1,
            }}
          >
            <UserAvatar uri={current.avatar} size={36} />
            <Text
              numberOfLines={1}
              style={{
                color: "#fff",
                fontSize: 13,
                fontWeight: "600",
                flexShrink: 1,
              }}
            >
              @{current.handle}
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 11 }}>
              {dayjs.utc(current.createdAt).local().fromNow()}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={{ padding: 6 }}>
            <Text style={{ color: "#fff", fontSize: 18 }}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Album art with tap zones */}
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <TouchableOpacity
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: "33%",
              zIndex: 10,
            }}
            onPress={goPrev}
            activeOpacity={1}
          />
          <TouchableOpacity
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              bottom: 0,
              width: "33%",
              zIndex: 10,
            }}
            onPress={goNext}
            activeOpacity={1}
          />
          <TouchableOpacity
            onPress={() => current.trackUri && onPressTrack(current.trackUri)}
            activeOpacity={0.9}
          >
            {current.albumArt ? (
              <Image
                source={current.albumArt}
                style={{ width: artSize, height: artSize, borderRadius: 16 }}
                contentFit="cover"
              />
            ) : (
              <View
                style={{
                  width: artSize,
                  height: artSize,
                  borderRadius: 16,
                  backgroundColor: colors.surface2,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{ fontSize: 80, opacity: 0.2, color: colors.text }}
                >
                  ♪
                </Text>
              </View>
            )}
          </TouchableOpacity>
          {/* Above the story tap zones; only the heart receives touches. */}
          <View
            pointerEvents="box-none"
            style={{
              position: "absolute",
              width: artSize,
              height: artSize,
              borderRadius: 16,
              overflow: "hidden",
              zIndex: 20,
            }}
          >
            <LinearGradient
              colors={["transparent", "rgba(0,0,0,0.75)"]}
              pointerEvents="box-none"
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
            >
              <TrackLikeButton
                track={current}
                showCount
                color="rgba(255,255,255,0.9)"
              />
            </LinearGradient>
          </View>
        </View>

        {/* Track info */}
        <View
          style={{
            paddingHorizontal: 24,
            paddingBottom: 96,
            paddingTop: 16,
            alignItems: "center",
          }}
        >
          <View
            style={{
              width: "100%",
              minHeight: 44,
              justifyContent: "center",
            }}
          >
            <MarqueeText
              key={current.trackUri || current.uri || current.title}
              centered
              enabled={active && foreground}
              containerStyle={{ width: "100%" }}
              onPress={current.trackUri ? () => onPressTrack(current.trackUri!) : undefined}
              style={{
                color: "#fff",
                fontSize: 20,
                lineHeight: 28,
                fontWeight: "700",
              }}
            >
              {current.title}
            </MarqueeText>
          </View>
          <TouchableOpacity
            onPress={() =>
              current.artistUri && onPressArtist(current.artistUri)
            }
          >
            <Text
              style={{
                color: "rgba(255,255,255,0.6)",
                fontSize: 15,
                textAlign: "center",
              }}
            >
              {current.artist}
            </Text>
          </TouchableOpacity>
          <StoryLinks
            key={current.trackUri || current.uri}
            story={current}
            active={active && foreground}
            onShare={() => {
              animRef.current?.stop();
              onShare(current);
            }}
            onOpen={(url) => {
              animRef.current?.stop();
              void Linking.openURL(url).catch(() => {
                Alert.alert("Could not open link", "Please try again.");
                startProgress();
              });
            }}
          />
        </View>
      </SafeAreaView>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Add a shout"
        disabled={
          !current.trackUri && !current.uri?.includes("/app.rocksky.scrobble/")
        }
        onPress={() => {
          animRef.current?.stop();
          onAddShout(current);
        }}
        activeOpacity={0.75}
        style={{
          position: "absolute",
          bottom: insets.bottom + 16,
          left: 24,
          right: 24,
          minHeight: 52,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.2)",
          backgroundColor: "rgba(255,255,255,0.12)",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          opacity:
            current.trackUri || current.uri?.includes("/app.rocksky.scrobble/")
              ? 1
              : 0.4,
        }}
      >
        <Feather name="message-circle" size={21} color="#fff" />
        <Text style={{ color: "#fff", fontSize: 15, fontWeight: "600" }}>
          Add a shout
        </Text>
      </TouchableOpacity>
    </View>
  );
};

export default Story;
