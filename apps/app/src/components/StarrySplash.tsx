import { useCallback, useEffect, useId, useRef, useState } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";

const FADE_OUT_MS = 400;
const GLOW_SIZE = 240;

// Beamed eighth-note pair (24x24 grid), same mark as the app icon.
const NOTE_PATH =
  "M21,3V15.5A3.5,3.5 0 0,1 17.5,19A3.5,3.5 0 0,1 14,15.5A3.5,3.5 0 0,1 " +
  "17.5,12C18.04,12 18.55,12.12 19,12.34V6.47L9,8.6V17.5A3.5,3.5 0 0,1 " +
  "5.5,21A3.5,3.5 0 0,1 2,17.5A3.5,3.5 0 0,1 5.5,14C6.04,14 6.55,14.12 " +
  "7,14.34V6L21,3Z";

type Star = {
  x: number;
  y: number;
  r: number;
  opacity: number;
  color: string;
};

type TwinkleStarSpec = Star & {
  delay: number;
  duration: number;
  peak: number;
};

// Deterministic PRNG so star positions are stable across re-renders.
function mulberry32(seed: number): () => number {
  let t = seed;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function makeStar(rand: () => number): Star {
  return {
    x: rand(),
    y: rand(),
    r: 0.5 + rand() * 1.3,
    opacity: 0.25 + rand() * 0.6,
    color: rand() < 0.2 ? "#ffc9dd" : "#ffffff",
  };
}

const rand = mulberry32(0x50cc5e1);
const STATIC_STARS: Star[] = Array.from({ length: 58 }, () => makeStar(rand));
const TWINKLE_STARS: TwinkleStarSpec[] = Array.from({ length: 12 }, () => ({
  ...makeStar(rand),
  r: 0.9 + rand() * 0.9,
  opacity: 0.15 + rand() * 0.25,
  delay: rand() * 2000,
  duration: 900 + rand() * 1600,
  peak: 0.8 + rand() * 0.2,
}));

function TwinkleStar({
  star,
  width,
  height,
}: {
  star: TwinkleStarSpec;
  width: number;
  height: number;
}) {
  const opacity = useSharedValue(star.opacity);

  useEffect(() => {
    opacity.value = withDelay(
      star.delay,
      withRepeat(
        withTiming(star.peak, {
          duration: star.duration,
          easing: Easing.inOut(Easing.quad),
        }),
        -1,
        true,
      ),
    );
  }, [opacity, star.delay, star.duration, star.peak]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const size = star.r * 2;
  return (
    <Animated.View
      style={[
        styles.twinkle,
        {
          left: star.x * width - star.r,
          top: star.y * height - star.r,
          width: size,
          height: size,
          borderRadius: star.r,
          backgroundColor: star.color,
        },
        animatedStyle,
      ]}
    />
  );
}

function Glow() {
  const gradientId = useId();
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [pulse]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.7 + pulse.value * 0.3,
    transform: [{ scale: 1 + pulse.value * 0.08 }],
  }));

  return (
    <Animated.View style={[styles.glow, animatedStyle]}>
      <Svg width={GLOW_SIZE} height={GLOW_SIZE}>
        <Defs>
          <RadialGradient id={gradientId} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#ff2876" stopOpacity={0.38} />
            <Stop offset="45%" stopColor="#ff2876" stopOpacity={0.14} />
            <Stop offset="100%" stopColor="#ff2876" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle
          cx={GLOW_SIZE / 2}
          cy={GLOW_SIZE / 2}
          r={GLOW_SIZE / 2}
          fill={`url(#${gradientId})`}
        />
      </Svg>
    </Animated.View>
  );
}

export default function StarrySplash({
  visible,
  onFadeOutDone,
}: {
  visible: boolean;
  onFadeOutDone?: () => void;
}) {
  const skyGradientId = useId();
  const { width, height } = useWindowDimensions();
  const [rendered, setRendered] = useState(visible);
  const opacity = useSharedValue(visible ? 1 : 0);
  const onFadeOutDoneRef = useRef(onFadeOutDone);

  useEffect(() => {
    onFadeOutDoneRef.current = onFadeOutDone;
  }, [onFadeOutDone]);

  const handleHidden = useCallback(() => {
    setRendered(false);
    onFadeOutDoneRef.current?.();
  }, []);

  useEffect(() => {
    if (visible) {
      setRendered(true);
      opacity.value = withTiming(1, { duration: 250 });
      return;
    }
    opacity.value = withTiming(
      0,
      { duration: FADE_OUT_MS, easing: Easing.out(Easing.quad) },
      (finished) => {
        if (finished) {
          runOnJS(handleHidden)();
        }
      },
    );
  }, [visible, opacity, handleHidden]);

  const rootStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  if (!rendered) {
    return null;
  }

  return (
    <Animated.View
      style={[styles.root, rootStyle]}
      pointerEvents={visible ? "auto" : "none"}
    >
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={skyGradientId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#0b0418" />
            <Stop offset="0.55" stopColor="#130825" />
            <Stop offset="1" stopColor="#2b1a4c" />
          </LinearGradient>
        </Defs>
        <Rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill={`url(#${skyGradientId})`}
        />
        {STATIC_STARS.map((star, index) => (
          <Circle
            // biome-ignore lint/suspicious/noArrayIndexKey: stars are static and deterministic
            key={index}
            cx={star.x * width}
            cy={star.y * height}
            r={star.r}
            fill={star.color}
            opacity={star.opacity}
          />
        ))}
      </Svg>
      {TWINKLE_STARS.map((star, index) => (
        <TwinkleStar
          // biome-ignore lint/suspicious/noArrayIndexKey: stars are static and deterministic
          key={index}
          star={star}
          width={width}
          height={height}
        />
      ))}
      <View style={styles.center} pointerEvents="none">
        <View style={styles.markWrap}>
          <Glow />
          <Svg width={72} height={72} viewBox="0 0 24 24">
            <Path d={NOTE_PATH} fill="#ffffff" />
          </Svg>
        </View>
        <Text style={styles.wordmark}>Rocksky</Text>
        <Text style={styles.tagline}>Music scrobbling on AT Protocol</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
    backgroundColor: "#130825",
  },
  twinkle: {
    position: "absolute",
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  markWrap: {
    width: 120,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  glow: {
    position: "absolute",
    width: GLOW_SIZE,
    height: GLOW_SIZE,
    top: (120 - GLOW_SIZE) / 2,
    left: (120 - GLOW_SIZE) / 2,
  },
  wordmark: {
    marginTop: 8,
    fontFamily: "RockfordSansBold",
    fontSize: 28,
    color: "#ffffff",
  },
  tagline: {
    marginTop: 6,
    fontFamily: "RockfordSansRegular",
    fontSize: 12,
    color: "rgba(191, 174, 195, 0.65)",
  },
});
