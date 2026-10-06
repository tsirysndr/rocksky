import Feather from "@expo/vector-icons/Feather";
import MaterialIcons from "@expo/vector-icons/MaterialCommunityIcons";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import utc from "dayjs/plugin/utc";
import { Image } from "expo-image";
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
  Animated,
  PanResponder,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text } from "@/src/components/Text";
import UserAvatar from "@/src/components/UserAvatar";
import { useStoryLike } from "@/src/hooks/useStoryLike";
import { storage } from "@/src/storage";
import { colors } from "@/src/theme";
import type { Story as StoryItem } from "@/src/types/feed";

dayjs.extend(relativeTime);
dayjs.extend(utc);

const STORY_DURATION = 5000;

export type StoryProps = {
  stories: StoryItem[];
  index?: number;
  onOpenProfile: (did: string) => void;
  onPressArtist: (artistUri: string) => void;
  onPressTrack: (trackUri: string) => void;
  onClose: () => void;
  onShare: (story: StoryItem) => void;
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
  active,
}) => {
  const layout = useWindowDimensions();
  const [index, setIndex] = useState(
    Math.min(Math.max(startIndex ?? 0, 0), Math.max(stories.length - 1, 0)),
  );
  const progress = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const current = stories[index];
  const { liked, pending, toggle } = useStoryLike(current);
  const artSize = Math.min(layout.width * 0.8, 380);

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
    if (active) startProgress();
    else animRef.current?.stop();
    return () => animRef.current?.stop();
  }, [startProgress, active]);

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
        {/* Progress bars */}
        <View
          style={{
            flexDirection: "row",
            gap: 3,
            paddingHorizontal: 12,
            paddingTop: 8,
            paddingBottom: 6,
          }}
        >
          {stories.map((story, i) => (
            <View
              key={`${story.trackId}-${story.did}-${story.createdAt}-${i}`}
              style={{
                flex: 1,
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
                  width:
                    i < index
                      ? "100%"
                      : i === index
                        ? progress.interpolate({
                            inputRange: [0, 1],
                            outputRange: ["0%", "100%"],
                          })
                        : "0%",
                }}
              />
            </View>
          ))}
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
          <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 11 }}>
            {index + 1}/{stories.length}
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Share this story"
            accessibilityHint="Opens the card customization screen"
            onPress={() => {
              animRef.current?.stop();
              onShare(current);
            }}
            style={{ padding: 6 }}
          >
            <Feather name="share-2" size={21} color="#fff" />
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
        </View>

        {/* Track info */}
        <View
          style={{
            paddingHorizontal: 24,
            paddingBottom: 40,
            paddingTop: 16,
            alignItems: "center",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ width: 44 }} />
            <TouchableOpacity
              style={{ flexShrink: 1 }}
              onPress={() => current.trackUri && onPressTrack(current.trackUri)}
            >
              <Text
                style={{
                  color: "#fff",
                  fontSize: 20,
                  fontWeight: "700",
                  textAlign: "center",
                  marginBottom: 4,
                }}
              >
                {current.title}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={liked ? "Unlike track" : "Like track"}
              accessibilityState={{
                selected: liked,
                disabled: pending || !current.trackUri,
              }}
              disabled={pending || !current.trackUri}
              onPress={() => {
                if (!storage.getToken()) {
                  Alert.alert(
                    "Sign in to like tracks",
                    "Sign in from your profile to save this track.",
                  );
                  return;
                }
                toggle();
              }}
              style={{
                width: 44,
                height: 44,
                alignItems: "center",
                justifyContent: "center",
                opacity: pending ? 0.6 : 1,
              }}
            >
              <MaterialIcons
                name={liked ? "heart" : "heart-outline"}
                size={26}
                color={liked ? colors.primary : "#fff"}
              />
            </TouchableOpacity>
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
        </View>
      </SafeAreaView>
    </View>
  );
};

export default Story;
