import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Easing,
  ScrollView,
  StyleSheet,
  type StyleProp,
  type TextStyle,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import { Text } from "./Text";

type Props = {
  children: string;
  style?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  onPress?: () => void;
  centered?: boolean;
  enabled?: boolean;
};

/** Measure the untruncated line; animate only the portion outside its viewport. */
export default function MarqueeText({
  children,
  style,
  containerStyle,
  onPress,
  centered = false,
  enabled = true,
}: Props) {
  const [viewportWidth, setViewportWidth] = useState(0);
  const [line, setLine] = useState({ width: 0, height: 0 });
  // Stay still until the accessibility preference has been read.
  const [reduceMotion, setReduceMotion] = useState(true);
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  );
  const offset = useRef(new Animated.Value(0)).current;
  const { fontScale } = useWindowDimensions();
  const textStyle = StyleSheet.flatten(style);
  const fadeWidth =
    viewportWidth > 0 && line.width > viewportWidth + 1
      ? Math.min(10, viewportWidth / 4)
      : 0;
  const fadeFraction = viewportWidth > 0 ? fadeWidth / viewportWidth : 0;
  const overflow = Math.max(0, line.width + fadeWidth * 2 - viewportWidth);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted) setReduceMotion(value);
      })
      .catch(() => {});
    const motion = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    const activity = AppState.addEventListener("change", (value) =>
      setForeground(value === "active"),
    );
    return () => {
      mounted = false;
      motion.remove();
      activity.remove();
    };
  }, []);

  useEffect(() => {
    offset.setValue(0);
    if (
      !enabled ||
      reduceMotion ||
      !foreground ||
      viewportWidth <= 0 ||
      overflow <= 1
    )
      return;
    const duration = Math.max(1000, (overflow / 28) * 1000);
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(1400),
        Animated.timing(offset, {
          toValue: -overflow,
          duration,
          easing: Easing.linear,
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.delay(1200),
        Animated.timing(offset, {
          toValue: 0,
          duration,
          easing: Easing.linear,
          useNativeDriver: true,
          isInteraction: false,
        }),
      ]),
    );
    animation.start();
    return () => {
      animation.stop();
      offset.setValue(0);
    };
  }, [
    children,
    enabled,
    reduceMotion,
    foreground,
    overflow,
    viewportWidth,
    fontScale,
    offset,
  ]);

  return (
    <View
      onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)}
      style={[
        {
          overflow: "hidden",
          minWidth: 0,
          height:
            line.height ||
            (textStyle?.lineHeight ?? (textStyle?.fontSize ?? 14) * 1.5) *
              fontScale,
        },
        containerStyle,
      ]}
    >
      <MaskedView
        style={{ flex: 1 }}
        pointerEvents={onPress ? "auto" : "none"}
        maskElement={
          fadeWidth > 0 ? (
            <LinearGradient
              style={{ flex: 1 }}
              colors={["transparent", "black", "black", "transparent"]}
              locations={[0, fadeFraction, 1 - fadeFraction, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            />
          ) : (
            <View style={{ flex: 1, backgroundColor: "black" }} />
          )
        }
      >
        <ScrollView
          horizontal
          pointerEvents={onPress ? "auto" : "none"}
          scrollEnabled={false}
          showsHorizontalScrollIndicator={false}
          removeClippedSubviews={false}
          contentContainerStyle={{
            flexGrow: 1,
            // Keep the first/last letters fully visible during the end pauses.
            paddingHorizontal: fadeWidth,
            alignItems: "flex-start",
            justifyContent: centered && overflow <= 1 ? "center" : "flex-start",
          }}
        >
          <Animated.View style={{ transform: [{ translateX: offset }] }}>
            <Text
              numberOfLines={1}
              onLayout={(event) => {
                const { width, height } = event.nativeEvent.layout;
                setLine((previous) =>
                  previous.width === width && previous.height === height
                    ? previous
                    : { width, height },
                );
              }}
              onPress={onPress}
              accessibilityRole={onPress ? "link" : undefined}
              style={style}
            >
              {children}
            </Text>
          </Animated.View>
        </ScrollView>
      </MaskedView>
    </View>
  );
}
