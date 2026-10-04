import Feather from "@expo/vector-icons/Feather";
import MaterialIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { usePlaybackSource, sameSource } from "../hooks/usePlaybackSource";
import { localQueue } from "../lib/uploadEngine";
import { colors } from "../theme";
import { Text } from "./Text";

type Props = { visible: boolean; onClose: () => void };

/** What a source is doing, or that it is doing nothing. */
const NOTHING_PLAYING = "Nothing playing";

/**
 * The device picker, shared by the mini player and the full player.
 *
 * Exactly one row is marked current — see usePlaybackSource for how that is
 * decided — and every row says what is playing on it, or that nothing is.
 */
export default function SourceSheet({ visible, onClose }: Props) {
  const {
    current,
    thisDeviceActive,
    spotifyActive,
    thisDeviceAvailable,
    deviceList,
    selectDevice,
    selectThisDevice,
    selectSpotify,
  } = usePlaybackSource();

  const pick = (choose: () => void) => {
    choose();
    onClose();
  };

  const queued = localQueue().length;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.grabHandle} />
        <Text style={styles.sheetTitle}>Select Source</Text>
        <ScrollView showsVerticalScrollIndicator={false}>
          {deviceList.map((device) => {
            const isCurrent = sameSource(current, {
              kind: "device",
              id: device.deviceId,
            });
            return (
              <TouchableOpacity
                key={device.deviceId}
                style={[styles.sheetRow, isCurrent && styles.sheetRowActive]}
                onPress={() => pick(() => selectDevice(device.deviceId))}
              >
                <MaterialIcons
                  name="speaker-wireless"
                  size={20}
                  color={isCurrent ? colors.primary : colors.textMuted}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.sheetRowTitle,
                      isCurrent && { color: colors.primary },
                    ]}
                  >
                    {device.name}
                  </Text>
                  <Text numberOfLines={1} style={styles.sheetRowSubtitle}>
                    {device.nowPlaying?.title
                      ? `${device.nowPlaying.title} — ${device.nowPlaying.artist}`
                      : NOTHING_PLAYING}
                  </Text>
                </View>
                {isCurrent && (
                  <Feather name="check" size={18} color={colors.primary} />
                )}
              </TouchableOpacity>
            );
          })}

          {thisDeviceAvailable && (
            <TouchableOpacity
              style={[
                styles.sheetRow,
                thisDeviceActive && styles.sheetRowActive,
              ]}
              onPress={() => pick(selectThisDevice)}
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
                  {queued > 0
                    ? `${queued} track${queued === 1 ? "" : "s"} queued`
                    : NOTHING_PLAYING}
                </Text>
              </View>
              {thisDeviceActive && (
                <Feather name="check" size={18} color={colors.primary} />
              )}
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.sheetRow, spotifyActive && styles.sheetRowActive]}
            onPress={() => pick(selectSpotify)}
          >
            <MaterialIcons
              name="spotify"
              size={20}
              color={spotifyActive ? "#1DB954" : colors.textMuted}
            />
            <Text
              style={[
                styles.sheetRowTitle,
                { flex: 1 },
                spotifyActive && { color: "#1DB954" },
              ]}
            >
              Spotify
            </Text>
            {spotifyActive && (
              <Feather name="check" size={18} color="#1DB954" />
            )}
          </TouchableOpacity>
        </ScrollView>

        <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
          <Text style={styles.cancelLabel}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    maxHeight: "80%",
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
  sheetRowActive: {
    backgroundColor: colors.surface2,
    borderRadius: 10,
    paddingHorizontal: 10,
    marginHorizontal: -10,
    borderBottomColor: "transparent",
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
