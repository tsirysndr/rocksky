import Feather from "@expo/vector-icons/Feather";
import MaterialIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Slider from "@react-native-community/slider";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Image } from "expo-image";
import { useAtomValue } from "jotai";
import { useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { activeDeviceIdAtom, devicesAtom } from "@/src/atoms/devices";
import {
  nowPlayingAtom,
  playerAtom,
  progressAtom,
} from "@/src/atoms/nowplaying";
import AudioSettingsSheet from "@/src/components/AudioSettingsSheet";
import MarqueeText from "@/src/components/MarqueeText";
import SourceSheet from "@/src/components/SourceSheet";
import { Text } from "@/src/components/Text";
import { usePlaybackControls } from "@/src/hooks/usePlaybackControls";
import { usePlaybackSource } from "@/src/hooks/usePlaybackSource";
import {
  localQueue,
  localQueueIndex,
  localQueueRevisionAtom,
  removeLocalAt,
  skipToLocal,
} from "@/src/lib/uploadEngine";
import type { RootStackParamList } from "@/src/Navigation";
import { colors } from "@/src/theme";

/** One row of the play queue, whichever source it came from. */
type QueueRow = {
  index: number;
  key: string;
  title: string;
  artist: string;
  albumArt?: string;
};

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function Player() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const focused = useIsFocused();
  const nowPlaying = useAtomValue(nowPlayingAtom);
  const progress = useAtomValue(progressAtom);
  useAtomValue(localQueueRevisionAtom);
  const player = useAtomValue(playerAtom);
  const devices = useAtomValue(devicesAtom);
  const activeDeviceId = useAtomValue(activeDeviceIdAtom);
  const {
    playPause,
    next,
    previous,
    seek,
    setShuffle,
    setRepeat,
    queueJump,
    queueRemove,
    toggleLike,
  } = usePlaybackControls();

  const { width } = useWindowDimensions();
  const artSize = Math.min(width * 0.85, 380);

  const [scrubbing, setScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);
  const [queueTab, setQueueTab] = useState<"history" | "upNext">("upNext");
  const [queueOpen, setQueueOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [audioSettingsOpen, setAudioSettingsOpen] = useState(false);
  const {
    current: currentSource,
    sourceLabel,
    thisDeviceActive,
    supportsAudioSettings,
  } = usePlaybackSource();

  const isSpotify = player === "spotify";
  const isLocal = currentSource?.kind === "local";
  const activeDevice =
    !isSpotify && !isLocal && activeDeviceId
      ? devices[activeDeviceId]
      : undefined;

  // The in-app engine keeps its queue in the uploadEngine module, not in the
  // device registry, so "This Device" had no queue to show at all. Both sources
  // are normalised to the same rows here. Reading the module on render is safe:
  // the engine's poll writes progressAtom every tick, which re-renders this.
  const queueRows: QueueRow[] = isLocal
    ? localQueue().map((track, index) => ({
        index,
        key: `${track.uploadId}-${index}`,
        title: track.title,
        artist: track.artist,
        albumArt: track.albumArt ?? undefined,
      }))
    : (activeDevice?.queue ?? []).map((item, index) => ({
        index,
        key: `${item.trackId ?? item.uploadId ?? item.title}-${index}`,
        title: item.title,
        artist: item.artist,
        albumArt: item.albumArt,
      }));
  const queueCurrentIndex = isLocal
    ? (localQueueIndex() ?? 0)
    : (activeDevice?.queueIndex ?? 0);
  const historyRows = queueRows.filter((row) => row.index < queueCurrentIndex);
  const upcomingRows = queueRows.filter((row) => row.index > queueCurrentIndex);
  const currentQueueRow = queueRows.find(
    (row) => row.index === queueCurrentIndex,
  );
  const jumpTo = (index: number) =>
    isLocal ? skipToLocal(index) : queueJump(index);
  const removeFrom = (index: number) => {
    if (index === queueCurrentIndex) return;
    if (isLocal) removeLocalAt(index);
    else queueRemove(index);
  };

  const renderQueueRow = (item: QueueRow) => {
    const index = item.index;
    const isCurrent = index === queueCurrentIndex;
    return (
      <TouchableOpacity style={styles.queueRow} onPress={() => jumpTo(index)}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          style={[
            styles.queueIndex,
            { width: Math.max(22, String(queueRows.length).length * 9 + 6) },
          ]}
        >
          {index + 1}
        </Text>
        {item.albumArt ? (
          <Image
            source={item.albumArt}
            style={styles.queueArt}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.queueArt, styles.artPlaceholder]}>
            <Text style={{ fontSize: 16, opacity: 0.2 }}>♪</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text
            numberOfLines={1}
            style={[styles.queueTitle, isCurrent && { color: colors.primary }]}
          >
            {item.title}
          </Text>
          <Text numberOfLines={1} style={styles.queueArtist}>
            {item.artist}
          </Text>
        </View>
        {!isCurrent && (
          <TouchableOpacity
            accessibilityLabel={`Remove ${item.title} from queue`}
            onPress={(event) => {
              event.stopPropagation();
              removeFrom(index);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="x" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  const duration = nowPlaying?.duration ?? 0;
  const position = scrubbing ? scrubValue : Math.min(progress, duration);
  const repeatMode = nowPlaying?.repeat ?? "off";

  const cycleRepeat = () => {
    const nextMode =
      repeatMode === "off" ? "all" : repeatMode === "all" ? "one" : "off";
    setRepeat(nextMode);
  };

  const openDetails = (
    uri: string,
    screen: "ArtistDetails" | "AlbumDetails",
  ) => {
    navigation.goBack();
    navigation.navigate("HomeTabs", {
      screen: "HomeTab",
      params: { screen, params: { uri } },
    } as never);
  };

  return (
    <View style={styles.root}>
      {nowPlaying?.cover ? (
        <Image
          source={nowPlaying.cover}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          blurRadius={40}
        />
      ) : null}
      <View style={styles.backgroundOverlay} />

      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Feather name="chevron-down" size={26} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.topCentre}>
            <Text style={styles.topLabel}>NOW PLAYING</Text>
            <Text numberOfLines={1} style={styles.topSource}>
              {sourceLabel}
            </Text>
          </View>
          <View style={styles.topActions}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Share now playing"
              accessibilityState={{ disabled: !nowPlaying }}
              disabled={!nowPlaying}
              style={!nowPlaying && styles.disabledAction}
              hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
              onPress={() => {
                if (!nowPlaying) return;
                const uri =
                  /^at:\/\/[^/\s?#]+\/app\.rocksky\.(song|scrobble)\/[^/\s?#]+$/.test(
                    nowPlaying.uri,
                  )
                    ? nowPlaying.uri
                    : "";
                navigation.navigate("ShareCard", {
                  item: {
                    kind: uri.includes("/app.rocksky.scrobble/")
                      ? "scrobble"
                      : "track",
                    uri,
                    title: nowPlaying.title,
                    subtitle: nowPlaying.artist,
                    artwork: nowPlaying.cover,
                  },
                });
              }}
            >
              <Feather
                name="share-2"
                size={20}
                color={nowPlaying ? colors.text : colors.textMuted}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setSourceOpen(true)}
              hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
            >
              <MaterialIcons
                name={thisDeviceActive ? "cellphone" : "speaker-wireless"}
                size={22}
                color={currentSource ? colors.primary : colors.textMuted}
              />
            </TouchableOpacity>
            {/* Off for a source that can take no DSP — Spotify plays in its
                own client — rather than opening a sheet that goes nowhere. */}
            <TouchableOpacity
              onPress={() => setAudioSettingsOpen(true)}
              disabled={!supportsAudioSettings}
              accessibilityState={{ disabled: !supportsAudioSettings }}
              accessibilityLabel="Audio settings"
              hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
              style={!supportsAudioSettings && styles.disabledAction}
            >
              <Feather
                name="sliders"
                size={20}
                color={supportsAudioSettings ? colors.text : colors.textMuted}
              />
            </TouchableOpacity>
            {!isSpotify && queueRows.length > 0 ? (
              <TouchableOpacity
                onPress={() => setQueueOpen(true)}
                hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
              >
                <MaterialIcons
                  name="playlist-music"
                  size={24}
                  color={colors.text}
                />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {!nowPlaying ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyLabel}>
              {currentSource
                ? `Nothing playing on ${sourceLabel}`
                : "Nothing playing"}
            </Text>
            <Text style={styles.emptyHint}>
              {queueRows.length > 0
                ? `${queueRows.length} track${queueRows.length === 1 ? "" : "s"} queued — press play to start`
                : "Pick something from your library, or choose another device"}
            </Text>
          </View>
        ) : (
          <View style={styles.body}>
            {/* Album art */}
            <View
              style={[styles.artShadow, { width: artSize, height: artSize }]}
            >
              {nowPlaying.cover ? (
                <Image
                  source={nowPlaying.cover}
                  style={styles.art}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.art, styles.artPlaceholder]}>
                  <Text style={{ fontSize: 80, opacity: 0.2 }}>♪</Text>
                </View>
              )}
            </View>

            {/* Track info */}
            <View style={styles.info}>
              <MarqueeText
                enabled={focused}
                centered
                containerStyle={{ alignSelf: "stretch" }}
                style={styles.title}
              >
                {nowPlaying.title}
              </MarqueeText>
              <View style={styles.subtitleRow}>
                <MarqueeText
                  enabled={focused}
                  centered
                  containerStyle={{ flex: 1, minWidth: 0 }}
                  style={[
                    styles.subtitle,
                    !!nowPlaying.artistUri && styles.subtitleLink,
                  ]}
                  onPress={
                    nowPlaying.artistUri
                      ? () =>
                          openDetails(
                            nowPlaying.artistUri as string,
                            "ArtistDetails",
                          )
                      : undefined
                  }
                >
                  {nowPlaying.artist}
                </MarqueeText>
                {nowPlaying.album ? (
                  <>
                    <Text style={styles.subtitle}> · </Text>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.subtitle,
                        { flexShrink: 1, maxWidth: "45%" },
                        !!nowPlaying.albumUri && styles.subtitleLink,
                      ]}
                      onPress={
                        nowPlaying.albumUri
                          ? () =>
                              openDetails(
                                nowPlaying.albumUri as string,
                                "AlbumDetails",
                              )
                          : undefined
                      }
                    >
                      {nowPlaying.album}
                    </Text>
                  </>
                ) : null}
              </View>
            </View>

            {/* Seek */}
            <View style={styles.seekBlock}>
              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={Math.max(duration, 1)}
                value={position}
                minimumTrackTintColor={colors.primary}
                maximumTrackTintColor="rgba(255,255,255,0.35)"
                thumbTintColor="#fff"
                onSlidingStart={() => {
                  setScrubValue(Math.min(progress, duration));
                  setScrubbing(true);
                }}
                onValueChange={(value) => {
                  if (scrubbing) setScrubValue(value);
                }}
                onSlidingComplete={(value) => {
                  setScrubbing(false);
                  seek(value);
                }}
              />
              <View style={styles.timeRow}>
                <Text style={styles.time}>{formatTime(position)}</Text>
                <Text style={styles.time}>{formatTime(duration)}</Text>
              </View>
            </View>

            {/* Transport */}
            <View style={styles.controlsRow}>
              {!isSpotify && (
                <TouchableOpacity
                  onPress={() => setShuffle(!nowPlaying.shuffle)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <MaterialIcons
                    name="shuffle"
                    size={24}
                    color={
                      nowPlaying.shuffle ? colors.primary : colors.textMuted
                    }
                  />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={previous}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Feather name="skip-back" size={32} color={colors.text} />
              </TouchableOpacity>
              <TouchableOpacity onPress={playPause} style={styles.playButton}>
                <Feather
                  name={nowPlaying.isPlaying ? "pause" : "play"}
                  size={28}
                  color="#fff"
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={next}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Feather name="skip-forward" size={32} color={colors.text} />
              </TouchableOpacity>
              {!isSpotify && (
                <TouchableOpacity
                  onPress={cycleRepeat}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <MaterialIcons
                    name={repeatMode === "one" ? "repeat-once" : "repeat"}
                    size={24}
                    color={
                      repeatMode !== "off" ? colors.primary : colors.textMuted
                    }
                  />
                </TouchableOpacity>
              )}
            </View>

            {/* Like */}
            <View style={styles.secondaryRow}>
              <TouchableOpacity
                onPress={toggleLike}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <MaterialIcons
                  name={nowPlaying.liked ? "heart" : "heart-outline"}
                  size={24}
                  color={nowPlaying.liked ? colors.primary : colors.textMuted}
                />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </SafeAreaView>

      {/* Queue panel */}
      <Modal
        visible={queueOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setQueueOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setQueueOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.grabHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Play Queue</Text>
              {queueRows.length > 0 && (
                <Text style={styles.sheetCount}>
                  {queueCurrentIndex + 1}/{queueRows.length}
                </Text>
              )}
            </View>
            {queueRows.length === 0 ? (
              <View style={styles.queueEmpty}>
                <Text style={styles.emptyLabel}>Queue is empty</Text>
              </View>
            ) : (
              <>
                {currentQueueRow && (
                  <View>
                    <Text style={styles.queueSectionTitle}>Now Playing</Text>
                    {renderQueueRow(currentQueueRow)}
                  </View>
                )}
                <View style={styles.queueTabs} accessibilityRole="tablist">
                  {(
                    [
                      {
                        key: "upNext",
                        label: "Up Next",
                        count: upcomingRows.length,
                      },
                      {
                        key: "history",
                        label: "History",
                        count: historyRows.length,
                      },
                    ] as const
                  ).map((tab) => (
                    <TouchableOpacity
                      key={tab.key}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: queueTab === tab.key }}
                      onPress={() => setQueueTab(tab.key)}
                      style={[
                        styles.queueTab,
                        queueTab === tab.key && styles.queueTabActive,
                      ]}
                    >
                      <Text
                        style={{
                          color:
                            queueTab === tab.key
                              ? colors.primary
                              : colors.textMuted,
                        }}
                      >
                        {tab.label} ({tab.count})
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <FlatList
                  key={queueTab}
                  data={queueTab === "history" ? historyRows : upcomingRows}
                  keyExtractor={(item) => item.key}
                  renderItem={({ item }) => renderQueueRow(item)}
                  ListEmptyComponent={
                    <Text style={styles.queueSectionEmpty}>
                      {queueTab === "history"
                        ? "No previous tracks"
                        : "No tracks up next"}
                    </Text>
                  }
                />
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <SourceSheet visible={sourceOpen} onClose={() => setSourceOpen(false)} />
      <AudioSettingsSheet
        visible={audioSettingsOpen}
        onClose={() => setAudioSettingsOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  backgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(19,8,37,0.82)",
  },
  safe: {
    flex: 1,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  topCentre: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 8,
  },
  topLabel: {
    fontSize: 11,
    letterSpacing: 2,
    color: colors.textMuted,
  },
  topSource: {
    fontSize: 10,
    color: colors.textMuted,
    opacity: 0.7,
    marginTop: 2,
  },
  topActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  disabledAction: {
    opacity: 0.4,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 40,
  },
  emptyLabel: {
    fontSize: 14,
    color: colors.textMuted,
  },
  emptyHint: {
    fontSize: 12,
    color: colors.textMuted,
    opacity: 0.7,
    textAlign: "center",
  },
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "space-evenly",
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  artShadow: {
    borderRadius: 24,
    backgroundColor: colors.surface2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 12,
  },
  art: {
    flex: 1,
    borderRadius: 24,
    overflow: "hidden",
  },
  artPlaceholder: {
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  info: {
    alignSelf: "stretch",
    alignItems: "center",
    gap: 6,
  },
  title: {
    fontSize: 24,
    fontFamily: "RockfordSansBold",
    color: "#fff",
    textAlign: "center",
  },
  subtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
  },
  subtitleLink: {
    color: colors.text,
  },
  seekBlock: {
    alignSelf: "stretch",
  },
  slider: {
    alignSelf: "stretch",
    height: 36,
  },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  time: {
    fontSize: 11,
    color: colors.textMuted,
    fontVariant: ["tabular-nums"],
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 28,
  },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    height: "70%",
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
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sheetTitle: {
    fontSize: 15,
    fontFamily: "RockfordSansMedium",
    color: colors.text,
  },
  sheetCount: {
    fontSize: 12,
    color: colors.textMuted,
    fontVariant: ["tabular-nums"],
  },
  queueTabs: { flexDirection: "row", marginHorizontal: 20, marginVertical: 12 },
  queueTab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  queueTabActive: { borderBottomColor: colors.primary },
  queueSectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  queueSectionEmpty: {
    color: colors.textMuted,
    fontSize: 13,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  queueEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  queueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  queueIndex: {
    flexShrink: 0,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  queueArt: {
    width: 36,
    height: 36,
    borderRadius: 6,
    overflow: "hidden",
  },
  queueTitle: {
    fontSize: 14,
    color: colors.text,
  },
  queueArtist: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
});
