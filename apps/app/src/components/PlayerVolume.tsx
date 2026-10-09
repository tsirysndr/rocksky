import Feather from "@expo/vector-icons/Feather";
import Slider from "@react-native-community/slider";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useAtomValue, useSetAtom } from "jotai";
import { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import {
  devicesAtom,
  remoteCommandsAtom,
  type PlaybackSource,
} from "../atoms/devices";
import { API_URL } from "../consts";
import { getLocalVolume, setLocalVolume } from "../lib/uploadEngine";
import { storage } from "../storage";
import { colors } from "../theme";
import { Text } from "./Text";

export default function PlayerVolume({
  source,
  focused,
}: {
  source: PlaybackSource | null;
  focused: boolean;
}) {
  const devices = useAtomValue(devicesAtom);
  const setDevices = useSetAtom(devicesAtom);
  const commands = useAtomValue(remoteCommandsAtom);
  const client = useQueryClient();
  const [draft, setDraft] = useState<number | null>(null);
  const key = ["playerVolume", storage.getDid(), source];
  const query = useQuery({
    queryKey: key,
    enabled: focused && !!source && source.kind !== "device",
    refetchInterval: source?.kind === "spotify" ? 15000 : 1000,
    queryFn: async () => {
      if (source?.kind === "spotify") {
        const { data } = await axios.get<{
          volume: number | null;
          supported: boolean;
        }>(`${API_URL}/spotify/volume`, {
          headers: { Authorization: `Bearer ${storage.getToken()}` },
        });
        return data;
      }
      const level = getLocalVolume();
      return {
        volume: level === null ? null : level * 100,
        supported: level !== null,
      };
    },
  });
  const remoteVolume =
    source?.kind === "device"
      ? devices[source.id]?.nowPlaying?.volume
      : undefined;
  const volume =
    source?.kind === "device"
      ? remoteVolume === undefined
        ? null
        : remoteVolume * 100
      : (query.data?.volume ?? null);
  const supported =
    source?.kind === "device"
      ? !!commands && remoteVolume !== undefined
      : !!query.data?.supported && !query.isError;
  const mutation = useMutation({
    mutationFn: async (percent: number) => {
      if (source?.kind === "device") {
        if (!commands || !source.id.trim())
          throw new Error("Player is unavailable");
        commands.send("volume", { volume: percent / 100 }, source.id);
      } else if (source?.kind === "spotify") {
        await axios.put(
          `${API_URL}/spotify/volume`,
          {},
          {
            params: { volume_percent: percent },
            headers: { Authorization: `Bearer ${storage.getToken()}` },
          },
        );
      } else if (source) setLocalVolume(percent / 100);
    },
    onMutate: () => client.cancelQueries({ queryKey: key }),
    onSuccess: (_result, percent) => {
      if (source?.kind === "device") {
        setDevices((current) => {
          const device = current[source.id];
          if (!device?.nowPlaying) return current;
          return {
            ...current,
            [source.id]: {
              ...device,
              nowPlaying: { ...device.nowPlaying, volume: percent / 100 },
            },
          };
        });
      }
      client.setQueryData(key, { volume: percent, supported: true });
    },
    onError: () => Alert.alert("Couldn’t change volume", "Please try again."),
    onSettled: () => {
      setDraft(null);
      void client.invalidateQueries({ queryKey: key });
    },
  });
  const level = Math.round(Math.max(0, Math.min(100, draft ?? volume ?? 0)));
  const disabled = !supported || volume === null || mutation.isPending;
  return (
    <View style={[styles.row, !supported && { opacity: 0.4 }]}>
      <Feather
        name={level === 0 ? "volume-x" : "volume-2"}
        size={16}
        color={colors.textMuted}
      />
      <Slider
        accessibilityLabel="Player volume"
        accessibilityValue={
          volume === null
            ? { text: "Unavailable" }
            : { min: 0, max: 100, now: level, text: `${level}%` }
        }
        accessibilityState={{ disabled }}
        style={styles.slider}
        minimumValue={0}
        maximumValue={100}
        step={1}
        value={level}
        disabled={disabled}
        thumbTintColor="transparent"
        minimumTrackTintColor={colors.textMuted}
        maximumTrackTintColor={colors.surface3}
        onSlidingStart={() => setDraft(level)}
        onValueChange={setDraft}
        onSlidingComplete={(value) =>
          mutation.mutate(Math.round(Math.max(0, Math.min(100, value))))
        }
      />
      <Text style={styles.level}>{volume === null ? "—" : `${level}%`}</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    width: "75%",
    maxWidth: 300,
    gap: 8,
    paddingBottom: 4,
  },
  slider: { flex: 1, height: 36 },
  level: {
    color: colors.textMuted,
    fontSize: 11,
    fontVariant: ["tabular-nums"],
    width: 38,
    textAlign: "right",
  },
});
