import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import utc from "dayjs/plugin/utc";
import { Image } from "expo-image";
import { type FC, useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text } from "@/src/components/Text";
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
};

const Story: FC<StoryProps> = ({
  stories,
  index: startIndex,
  onOpenProfile,
  onPressArtist,
  onPressTrack,
  onClose,
}) => {
  const layout = useWindowDimensions();
  const [index, setIndex] = useState(
    Math.min(Math.max(startIndex ?? 0, 0), Math.max(stories.length - 1, 0)),
  );
  const progress = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const current = stories[index];
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
    startProgress();
    return () => animRef.current?.stop();
  }, [startProgress]);

  if (!current) return null;

  const goNext = () => {
    if (index + 1 >= stories.length) {
      onClose();
      return;
    }
    setIndex((i) => i + 1);
  };

  const goPrev = () => {
    if (index === 0) return;
    setIndex((i) => i - 1);
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
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
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                overflow: "hidden",
                backgroundColor: colors.avatarBackground,
              }}
            >
              {current.avatar && !current.avatar.endsWith("/@jpeg") ? (
                <Image
                  source={current.avatar}
                  style={{ width: 36, height: 36 }}
                  contentFit="cover"
                />
              ) : null}
            </View>
            <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>
              @{current.handle}
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 11 }}>
              {dayjs.utc(current.createdAt).local().fromNow()}
            </Text>
          </TouchableOpacity>
          <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 11 }}>
            {index + 1}/{stories.length}
          </Text>
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
          <TouchableOpacity
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
