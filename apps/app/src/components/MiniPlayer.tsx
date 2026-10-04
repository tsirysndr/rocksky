import Feather from "@expo/vector-icons/Feather";
import MaterialIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Image } from "expo-image";
import { useAtom, useAtomValue } from "jotai";
import { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import {
  activeDeviceIdAtom,
  devicesAtom,
  remoteCommandsAtom,
} from "../atoms/devices";
import { nowPlayingAtom, playerAtom, progressAtom } from "../atoms/nowplaying";
import { usePlaybackControls } from "../hooks/usePlaybackControls";
import { isLocalEngineAvailable, localQueue } from "../lib/uploadEngine";
import { colors } from "../theme";
import { Text } from "./Text";

type Props = { onOpenPlayer?: () => void };

export default function MiniPlayer({ onOpenPlayer }: Props) {
  const nowPlaying = useAtomValue(nowPlayingAtom);
  const progress = useAtomValue(progressAtom);
  const player = useAtomValue(playerAtom);
  const devices = useAtomValue(devicesAtom);
  const [activeDeviceId, setActiveDeviceId] = useAtom(activeDeviceIdAtom);
  const commands = useAtomValue(remoteCommandsAtom);
  const { playPause, next, toggleLike } = usePlaybackControls();
  const [sourceSheetOpen, setSourceSheetOpen] = useState(false);

  const deviceList = useMemo(() => Object.values(devices), [devices]);
  const activeDevice = activeDeviceId ? devices[activeDeviceId] : undefined;

  if (!nowPlaying && deviceList.length === 0) return null;

  const progressPct =
    nowPlaying && nowPlaying.duration > 0
      ? Math.min(100, (progress / nowPlaying.duration) * 100)
      : 0;

  const selectDevice = (deviceId: string) => {
    commands?.setPrimary(deviceId);
    setSourceSheetOpen(false);
  };

  const selectSpotify = () => {
    setActiveDeviceId(null);
    setSourceSheetOpen(false);
  };

  // "This Device": the in-app native engine playing uploaded tracks.
  const thisDeviceAvailable = isLocalEngineAvailable();
  const thisDeviceActive = player === "local";
  const selectThisDevice = () => {
    setActiveDeviceId(null);
    setSourceSheetOpen(false);
  };

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
            {nowPlaying?.artist ??
              (activeDevice ? activeDevice.name : "Select a device")}
          </Text>
        </TouchableOpacity>

        {/* Controls */}
        <View style={styles.controls}>
          {deviceList.length > 0 && (
            <TouchableOpacity
              onPress={() => setSourceSheetOpen(true)}
              hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
            >
              <MaterialIcons
                name="speaker-wireless"
                size={20}
                color={
                  activeDeviceId && player !== "spotify"
                    ? colors.primary
                    : colors.textMuted
                }
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

      {/* Source sheet */}
      <Modal
        visible={sourceSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSourceSheetOpen(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setSourceSheetOpen(false)}
        >
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.grabHandle} />
            <Text style={styles.sheetTitle}>Select Source</Text>
            {deviceList.map((device) => (
              <TouchableOpacity
                key={device.deviceId}
                style={styles.sheetRow}
                onPress={() => selectDevice(device.deviceId)}
              >
                <MaterialIcons
                  name="speaker-wireless"
                  size={20}
                  color={
                    device.deviceId === activeDeviceId
                      ? colors.primary
                      : colors.textMuted
                  }
                />
                <View style={{ flex: 1 }}>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.sheetRowTitle,
                      device.deviceId === activeDeviceId && {
                        color: colors.primary,
                      },
                    ]}
                  >
                    {device.name}
                  </Text>
                  {device.nowPlaying?.title && (
                    <Text numberOfLines={1} style={styles.sheetRowSubtitle}>
                      {device.nowPlaying.title}
                    </Text>
                  )}
                </View>
                {device.deviceId === activeDeviceId && (
                  <Feather name="check" size={18} color={colors.primary} />
                )}
              </TouchableOpacity>
            ))}
            {thisDeviceAvailable && (
              <TouchableOpacity
                style={styles.sheetRow}
                onPress={selectThisDevice}
              >
                <MaterialIcons
                  name="cellphone"
                  size={20}
                  color={thisDeviceActive ? colors.primary : colors.textMuted}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.sheetRowTitle,
                      thisDeviceActive && { color: colors.primary },
                    ]}
                  >
                    This Device
                  </Text>
                  <Text numberOfLines={1} style={styles.sheetRowSubtitle}>
                    {localQueue().length > 0
                      ? `${localQueue().length} tracks queued`
                      : "Your uploads"}
                  </Text>
                </View>
                {thisDeviceActive && (
                  <Feather name="check" size={18} color={colors.primary} />
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.sheetRow} onPress={selectSpotify}>
              <MaterialIcons
                name="spotify"
                size={20}
                color={player === "spotify" ? "#1DB954" : colors.textMuted}
              />
              <Text
                style={[
                  styles.sheetRowTitle,
                  player === "spotify" && { color: "#1DB954" },
                ]}
              >
                Spotify
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setSourceSheetOpen(false)}
            >
              <Text style={styles.cancelLabel}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
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
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingBottom: 32,
    paddingTop: 8,
  },
  grabHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surface3,
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 15,
    fontFamily: "RockfordSansMedium",
    color: colors.text,
    marginBottom: 8,
  },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sheetRowTitle: {
    fontSize: 14,
    color: colors.text,
  },
  sheetRowSubtitle: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  cancelButton: {
    marginTop: 12,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.surface2,
  },
  cancelLabel: {
    fontSize: 14,
    color: colors.text,
  },
});
