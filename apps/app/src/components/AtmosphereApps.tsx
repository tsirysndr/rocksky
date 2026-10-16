import Feather from "@expo/vector-icons/Feather";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Easing,
  Image,
  Linking,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Text } from "./Text";
import { colors } from "../theme";

// Keep bundled icons available offline, including before sign-in.
const apps = [
  {
    name: "Bluesky",
    source: require("../../../shared/atmosphere-icons/atmo-bluesky.jpg"),
  },
  {
    name: "Tangled",
    source: require("../../../shared/atmosphere-icons/atmo-tangled.jpg"),
  },
  {
    name: "Anisota",
    source: require("../../../shared/atmosphere-icons/atmo-anisota.jpg"),
  },
  {
    name: "Beacon Bits",
    source: require("../../../shared/atmosphere-icons/atmo-beacon-bits.jpg"),
  },
  {
    name: "Eurosky",
    source: require("../../../shared/atmosphere-icons/atmo-eurosky.jpg"),
  },
  {
    name: "Flashes",
    source: require("../../../shared/atmosphere-icons/atmo-flashes.jpg"),
  },
  {
    name: "Gander",
    source: require("../../../shared/atmosphere-icons/atmo-gander.jpg"),
  },
  {
    name: "Germ",
    source: require("../../../shared/atmosphere-icons/atmo-germ.jpg"),
  },
  {
    name: "Leaflet",
    source: require("../../../shared/atmosphere-icons/atmo-leaflet.jpg"),
  },
  {
    name: "Northsky",
    source: require("../../../shared/atmosphere-icons/atmo-northsky.jpg"),
  },
  {
    name: "Offprint",
    source: require("../../../shared/atmosphere-icons/atmo-offprint.jpg"),
  },
  {
    name: "Pckt",
    source: require("../../../shared/atmosphere-icons/atmo-pckt.jpg"),
  },
  {
    name: "Plyr",
    source: require("../../../shared/atmosphere-icons/atmo-plyr.jpg"),
  },
  {
    name: "Popfeed",
    source: require("../../../shared/atmosphere-icons/atmo-popfeed.jpg"),
  },
  {
    name: "Blento",
    source: require("../../../shared/atmosphere-icons/atmo-blento.jpg"),
  },
  {
    name: "Semble",
    source: require("../../../shared/atmosphere-icons/atmo-semble.jpg"),
  },
  {
    name: "Skylight",
    source: require("../../../shared/atmosphere-icons/atmo-skylight.jpg"),
  },
  {
    name: "Blacksky",
    source: require("../../../shared/atmosphere-icons/atmo-blacksky.jpg"),
  },
  {
    name: "Spark",
    source: require("../../../shared/atmosphere-icons/atmo-spark.png"),
  },
  {
    name: "Streamplace",
    source: require("../../../shared/atmosphere-icons/atmo-stream-place.jpg"),
  },
];
const groupWidth = apps.length * 48;

export default function AtmosphereApps() {
  const offset = useRef(new Animated.Value(0)).current;
  const [reducedMotion, setReducedMotion] = useState(true);
  const [paused, setPaused] = useState(false);
  const [active, setActive] = useState(AppState.currentState === "active");

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted) setReducedMotion(value);
      })
      .catch(() => {});
    const motion = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReducedMotion,
    );
    const appState = AppState.addEventListener("change", (state) =>
      setActive(state === "active"),
    );
    return () => {
      mounted = false;
      motion.remove();
      appState.remove();
    };
  }, []);

  useEffect(() => {
    if (reducedMotion || paused || !active) return;
    const animation = Animated.loop(
      Animated.timing(offset, {
        toValue: -groupWidth,
        duration: 40000,
        easing: Easing.linear,
        useNativeDriver: true,
        isInteraction: false,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [active, offset, paused, reducedMotion]);

  return (
    <View style={styles.container}>
      <View
        style={styles.strip}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Apps in the Atmosphere: ${apps.map((app) => app.name).join(", ")}`}
      >
        <Animated.View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.track, { transform: [{ translateX: offset }] }]}
        >
          {[0, 1].map((copy) => (
            <View key={copy} style={styles.group}>
              {apps.map((app) => (
                <Image key={app.name} source={app.source} style={styles.icon} />
              ))}
            </View>
          ))}
        </Animated.View>
        <LinearGradient
          pointerEvents="none"
          colors={[colors.background, "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.fade, { left: 0 }]}
        />
        <LinearGradient
          pointerEvents="none"
          colors={["transparent", colors.background]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.fade, { right: 0 }]}
        />
      </View>
      <View style={styles.footer}>
        <TouchableOpacity
          accessibilityRole="link"
          onPress={() => void Linking.openURL("https://atmosphereaccount.com")}
          style={styles.link}
        >
          <Text style={styles.linkText}>What is an atmosphere account?</Text>
        </TouchableOpacity>
        {!reducedMotion && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={
              paused ? "Play app animation" : "Pause app animation"
            }
            onPress={() => setPaused(!paused)}
            style={styles.pause}
          >
            <Feather
              name={paused ? "play" : "pause"}
              size={12}
              color={colors.textMuted}
            />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  strip: { height: 36, overflow: "hidden" },
  track: { flexDirection: "row", width: groupWidth * 2 },
  group: { flexDirection: "row", width: groupWidth },
  icon: { width: 36, height: 36, borderRadius: 10, marginRight: 12 },
  fade: { position: "absolute", top: 0, bottom: 0, width: 24 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  link: { minHeight: 44, justifyContent: "center", flexShrink: 1 },
  linkText: {
    color: colors.textMuted,
    fontSize: 12,
    textDecorationLine: "underline",
    textAlign: "center",
  },
  pause: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
