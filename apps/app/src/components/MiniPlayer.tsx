import Feather from "@expo/vector-icons/Feather";
import MaterialIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Image } from "expo-image";
import { useAtomValue } from "jotai";
import { useState } from "react";
import { Pressable, StyleSheet, TouchableOpacity, View } from "react-native";
import { nowPlayingAtom, progressAtom } from "../atoms/nowplaying";
import { usePlaybackControls } from "../hooks/usePlaybackControls";
import { usePlaybackSource } from "../hooks/usePlaybackSource";
import { colors } from "../theme";
import SourceSheet from "./SourceSheet";
import { Text } from "./Text";

type Props = { onOpenPlayer?: () => void };

export default function MiniPlayer({ onOpenPlayer }: Props) {
  const nowPlaying = useAtomValue(nowPlayingAtom);
  const progress = useAtomValue(progressAtom);
  const { playPause, next, toggleLike } = usePlaybackControls();
  const [sourceSheetOpen, setSourceSheetOpen] = useState(false);
  const {
    current,
    sourceLabel,
    thisDeviceActive,
    thisDeviceAvailable,
    deviceList,
  } = usePlaybackSource();

  if (!nowPlaying && deviceList.length === 0 && !thisDeviceAvailable) {
    return null;
  }

  const progressPct =
    nowPlaying && nowPlaying.duration > 0
      ? Math.min(100, (progress / nowPlaying.duration) * 100)
      : 0;

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.border,
      }}
    >
      {/* Progress bar */}
      <View style={{ height: 2, backgroundColor: colors.surface2 }}>
        <View
          style={{
            height: 2,
            width: `${progressPct}%` as `${number}%`,
            backgroundColor: colors.primary,
          }}
        />
      </View>

      {/* Row */}
      <View style={styles.row}>
        {/* Album art */}
        <Pressable onPress={onOpenPlayer} style={styles.art}>
          {nowPlaying?.cover ? (
            <Image
              source={nowPlaying.cover}
              style={{ width: 44, height: 44 }}
              contentFit="cover"
            />
          ) : (
            <View style={styles.artPlaceholder}>
              <Text style={{ fontSize: 20, opacity: 0.2 }}>♪</Text>
            </View>
          )}
        </Pressable>

        {/* Track info — opens the full player */}
        <TouchableOpacity
          style={{ flex: 1 }}
          onPress={onOpenPlayer}
          activeOpacity={0.7}
        >
          <Text numberOfLines={1} style={styles.title}>
            {nowPlaying?.title ?? "Nothing playing"}
          </Text>
          <Text numberOfLines={1} style={styles.subtitle}>
            {nowPlaying ? nowPlaying.artist : sourceLabel}
          </Text>
        </TouchableOpacity>

        {/* Controls */}
        <View style={styles.controls}>
          {(deviceList.length > 0 || thisDeviceAvailable) && (
            <TouchableOpacity
              onPress={() => setSourceSheetOpen(true)}
              hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
            >
              <MaterialIcons
                name={thisDeviceActive ? "cellphone" : "speaker-wireless"}
                size={20}
                color={current ? colors.primary : colors.textMuted}
              />
            </TouchableOpacity>
          )}

          {nowPlaying && (
            <TouchableOpacity
              onPress={toggleLike}
              hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
            >
              <MaterialIcons
                name={nowPlaying.liked ? "heart" : "heart-outline"}
                size={20}
                color={nowPlaying.liked ? colors.primary : colors.textMuted}
              />
            </TouchableOpacity>
          )}

          <TouchableOpacity onPress={playPause} style={styles.playButton}>
            <Feather
              name={nowPlaying?.isPlaying ? "pause" : "play"}
              size={16}
              color="#fff"
            />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={next}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
          >
            <Feather name="skip-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      <SourceSheet
        visible={sourceSheetOpen}
        onClose={() => setSourceSheetOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  art: {
    width: 44,
    height: 44,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: colors.surface2,
    flexShrink: 0,
  },
  artPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },
  subtitle: {
    fontSize: 11,
    color: colors.textMuted,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});
