import Feather from "@expo/vector-icons/Feather";
import { type NavigationProp, useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useAtomValue } from "jotai";
import { type ReactNode, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  type AnalyticsRange,
  getAnalyticsArtists,
  getAnalyticsDaily,
  getAnalyticsDecades,
  getAnalyticsScrobblers,
  getAnalyticsTracks,
} from "../../api/analytics";
import { authTokenAtom } from "../../atoms/auth";
import { profileAtom } from "../../atoms/profile";
import { Text } from "../../components/Text";
import UserAvatar from "../../components/UserAvatar";
import type { RootStackParamList } from "../../Navigation";
import { storage } from "../../storage";
import { colors } from "../../theme";
import { Bars, ListeningCalendar, palette, Trend } from "./Charts";
import {
  chartPoints,
  dailyPoints,
  presetRange,
  presets,
  summarize,
  validDate,
} from "./data";

type QueryState = {
  isPending: boolean;
  isError: boolean;
  refetch: () => unknown;
};
function Panel({
  title,
  note,
  query,
  children,
  empty = false,
  accessory,
  controls,
}: {
  title: string;
  note?: string;
  query: QueryState;
  children: ReactNode;
  empty?: boolean;
  accessory?: ReactNode;
  controls?: ReactNode;
}) {
  return (
    <View style={styles.panel}>
      <View style={styles.between}>
        <Text style={styles.panelTitle}>{title}</Text>
        {accessory}
      </View>
      {note && <Text style={styles.note}>{note}</Text>}
      {controls}
      {query.isPending ? (
        <View style={styles.placeholder}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.note}>Loading listening data…</Text>
        </View>
      ) : query.isError ? (
        <View style={styles.placeholder}>
          <Text style={styles.note}>This chart could not load.</Text>
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.retry}
            onPress={() => query.refetch()}
          >
            <Text>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : empty ? (
        <View style={styles.placeholder}>
          <Feather name="headphones" color={colors.textMuted} size={28} />
          <Text style={styles.note}>No listening data in this period.</Text>
        </View>
      ) : (
        children
      )}
    </View>
  );
}

function Ranking({
  rows,
  color,
  kind,
}: {
  rows: {
    key: string;
    title: string;
    subtitle?: string;
    image?: string;
    count: number;
    uri?: string;
  }[];
  color: string;
  kind: "ArtistDetails" | "SongDetails";
}) {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <View style={{ marginTop: 10 }}>
      {rows.map((row, i) => (
        <TouchableOpacity
          key={row.key}
          disabled={!row.uri}
          accessibilityRole="button"
          accessibilityLabel={`${i + 1}. ${row.title}, ${row.count} plays`}
          onPress={() => row.uri && navigation.navigate(kind, { uri: row.uri })}
          style={styles.rankRow}
        >
          <Text style={styles.rankNumber}>
            {String(i + 1).padStart(2, "0")}
          </Text>
          <View
            style={[
              styles.art,
              kind === "ArtistDetails" && { borderRadius: 25 },
            ]}
          >
            {row.image ? (
              <Image
                source={row.image}
                contentFit="cover"
                style={{ width: 46, height: 46 }}
              />
            ) : (
              <Feather
                name={kind === "ArtistDetails" ? "user" : "music"}
                size={20}
                color={color}
              />
            )}
          </View>
          <View style={{ flex: 1, gap: 5 }}>
            <View style={styles.between}>
              <Text numberOfLines={1} style={{ flex: 1, fontWeight: "600" }}>
                {row.title}
              </Text>
              <Text style={styles.count}>{row.count.toLocaleString()}</Text>
            </View>
            {row.subtitle && (
              <Text style={styles.rankSubtitle} numberOfLines={1}>
                {row.subtitle}
              </Text>
            )}
            <View style={styles.track}>
              <View
                style={{
                  width: `${Math.max(1, (row.count / max) * 100)}%`,
                  height: 4,
                  borderRadius: 3,
                  backgroundColor: color,
                }}
              />
            </View>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function CustomRange({
  value,
  onClose,
  onApply,
}: {
  value: AnalyticsRange;
  onClose: () => void;
  onApply: (range: AnalyticsRange) => void;
}) {
  const [from, setFrom] = useState(value.from);
  const [to, setTo] = useState(value.to);
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Close date range"
        />
        <SafeAreaView edges={["bottom"]} style={styles.sheet}>
          <View style={styles.between}>
            <Text style={styles.panelTitle}>Choose your dates</Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close">
              <Feather name="x" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          <Text style={styles.note}>
            Enter dates as YYYY-MM-DD. Reports use UTC days.
          </Text>
          <Text style={styles.inputLabel}>From</Text>
          <TextInput
            style={styles.input}
            accessibilityLabel="Start date"
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.textMuted}
            value={from}
            onChangeText={setFrom}
            maxLength={10}
            autoCorrect={false}
          />
          <Text style={styles.inputLabel}>To</Text>
          <TextInput
            style={styles.input}
            accessibilityLabel="End date"
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.textMuted}
            value={to}
            onChangeText={setTo}
            maxLength={10}
            autoCorrect={false}
          />
          <TouchableOpacity
            style={styles.apply}
            onPress={() => {
              if (
                !validDate(from) ||
                !validDate(to) ||
                from > to ||
                from < "2000-01-01" ||
                to > dayjs().format("YYYY-MM-DD")
              ) {
                Alert.alert(
                  "Check your dates",
                  "Choose valid dates between 2000-01-01 and today, with the start before the end.",
                );
                return;
              }
              onApply({ from, to, label: "Custom" });
              onClose();
            }}
          >
            <Text style={{ fontWeight: "700" }}>Show listening report</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

export default function Analytics() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const token = useAtomValue(authTokenAtom);
  const profile = useAtomValue(profileAtom);
  const ownDid = token ? (storage.getDid() ?? profile?.did) : undefined;
  const [scope, setScope] = useState<"mine" | "global">("mine");
  const [range, setRange] = useState(() => presetRange("30 days"));
  const [custom, setCustom] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [ranking, setRanking] = useState<"artists" | "tracks">("artists");
  const did = scope === "mine" ? (ownDid ?? undefined) : undefined;
  const args = { did, range };
  const key = ["analytics", did ?? "global", range.from, range.to];
  const daily = useQuery({
    queryKey: [...key, "daily"],
    queryFn: ({ signal }) => getAnalyticsDaily(args, signal),
    staleTime: 60000,
  });
  const artists = useQuery({
    queryKey: [...key, "artists"],
    queryFn: ({ signal }) => getAnalyticsArtists(args, signal),
    staleTime: 60000,
  });
  const tracks = useQuery({
    queryKey: [...key, "tracks"],
    queryFn: ({ signal }) => getAnalyticsTracks(args, signal),
    staleTime: 60000,
  });
  const decades = useQuery({
    queryKey: [...key, "decades"],
    queryFn: ({ signal }) => getAnalyticsDecades(args, signal),
    staleTime: 60000,
  });
  const listeners = useQuery({
    queryKey: ["analytics", "listeners", range.from, range.to],
    queryFn: ({ signal }) => getAnalyticsScrobblers(range, signal),
    enabled: !did,
    staleTime: 60000,
  });
  const points = useMemo(
    () => dailyPoints(daily.data ?? [], range),
    [daily.data, range],
  );
  const totals = useMemo(() => summarize(points), [points]);
  const chart = useMemo(() => chartPoints(points), [points]);
  const hasData = totals.total > 0;
  const rankQuery = ranking === "artists" ? artists : tracks;
  const rankRows =
    ranking === "artists"
      ? (artists.data ?? []).map((a, i) => ({
          key: a.id ?? a.uri ?? `${a.name}-${i}`,
          title: a.name ?? "Unknown artist",
          image: a.picture,
          count: a.playCount ?? 0,
          uri: a.uri,
        }))
      : (tracks.data ?? []).map((t, i) => ({
          key: t.id ?? t.uri ?? `${t.title}-${i}`,
          title: t.title ?? "Untitled",
          subtitle: t.artist,
          image: t.albumArt,
          count: t.playCount ?? 0,
          uri: t.uri,
        }));
  const decadePoints = (decades.data ?? [])
    .map((d) => ({
      key: String(d.decade),
      label: `${d.decade}s`,
      count: d.scrobbles ?? 0,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
  const refreshingAll = async () => {
    setRefreshing(true);
    try {
      await Promise.allSettled([
        daily.refetch(),
        artists.refetch(),
        tracks.refetch(),
        decades.refetch(),
        ...(!did ? [listeners.refetch()] : []),
      ]);
    } finally {
      setRefreshing(false);
    }
  };
  return (
    <SafeAreaView style={styles.page} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityLabel="Back"
          onPress={() => navigation.goBack()}
          style={styles.back}
        >
          <Feather name="arrow-left" color={colors.text} size={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Analytics</Text>
        <Feather name="activity" color={colors.primary} size={23} />
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refreshingAll()}
            tintColor={colors.primary}
          />
        }
      >
        <LinearGradient
          colors={["#35113f", "#1a1034", "#17102d"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.between}>
            <View style={styles.heroBadge}>
              <View style={styles.dot} />
              <Text style={styles.eyebrow}>LISTENING REPORT</Text>
            </View>
            {did && <UserAvatar uri={profile?.avatar} size={34} />}
          </View>
          <Text style={styles.heroTitle}>
            {did ? "Your music,\nin perspective." : "A world of\nlistening."}
          </Text>
          <Text style={styles.heroNote}>
            {did
              ? `The soundtrack to your days${profile?.handle ? ` · @${profile.handle}` : ""}`
              : "Discover what’s moving the Rocksky community"}
          </Text>
          <View style={styles.heroDate}>
            <Feather name="calendar" color="#e6bfd8" size={14} />
            <Text style={{ color: "#e6bfd8", fontSize: 12 }}>
              {dayjs(range.from).format("D MMM YYYY")} —{" "}
              {dayjs(range.to).format("D MMM YYYY")}
            </Text>
          </View>
        </LinearGradient>

        {!!ownDid && (
          <View style={styles.segment}>
            {(["mine", "global"] as const).map((value) => (
              <TouchableOpacity
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ checked: scope === value }}
                onPress={() => setScope(value)}
                style={[
                  styles.segmentItem,
                  scope === value && styles.segmentActive,
                ]}
              >
                <Text
                  style={{
                    color: scope === value ? colors.text : colors.textMuted,
                    fontWeight: "600",
                    fontSize: 13,
                  }}
                >
                  {value === "mine" ? "My listening" : "All of Rocksky"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          {presets.map((label) => (
            <TouchableOpacity
              key={label}
              accessibilityRole="button"
              accessibilityState={{ selected: range.label === label }}
              onPress={() => setRange(presetRange(label))}
              style={[styles.chip, range.label === label && styles.chipActive]}
            >
              <Text
                style={{
                  fontSize: 12,
                  color: range.label === label ? "#fff" : "#c2b1d1",
                }}
              >
                {label}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            onPress={() => setCustom(true)}
            style={[styles.chip, range.label === "Custom" && styles.chipActive]}
          >
            <Feather name="calendar" color={colors.text} size={13} />
            <Text style={{ fontSize: 12 }}>Custom</Text>
          </TouchableOpacity>
        </ScrollView>

        <View style={styles.statsGrid}>
          {[
            {
              label: "SCROBBLES",
              value: totals.total.toLocaleString(),
              note: `${points.length.toLocaleString()} days of music`,
              icon: "headphones" as const,
            },
            {
              label: "DAILY AVERAGE",
              value: totals.average.toLocaleString(undefined, {
                maximumFractionDigits: 1,
              }),
              note: "scrobbles per day",
              icon: "activity" as const,
            },
            {
              label: "ACTIVE DAYS",
              value: totals.active.toLocaleString(),
              note: `${Math.round((totals.active / Math.max(1, points.length)) * 100)}% of this period`,
              icon: "sun" as const,
            },
            {
              label: "BUSIEST DAY",
              value: (totals.busiest?.count ?? 0).toLocaleString(),
              note: totals.busiest
                ? dayjs(totals.busiest.key).format("ddd, D MMM")
                : "Waiting for your first listen",
              icon: "zap" as const,
            },
          ].map((stat, i) => (
            <View
              key={stat.label}
              style={[styles.stat, { borderTopColor: palette[i] }]}
            >
              <View style={styles.between}>
                <Feather name={stat.icon} size={17} color={palette[i]} />
                <Text style={styles.statLabel}>{stat.label}</Text>
              </View>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                style={styles.statValue}
              >
                {daily.isPending ? "…" : daily.isError ? "—" : stat.value}
              </Text>
              <Text style={styles.statNote}>
                {daily.isError ? "Could not load" : stat.note}
              </Text>
            </View>
          ))}
        </View>

        <Panel
          title="Scrobbles over time"
          note="Every listen adds to your story. Days are grouped in UTC."
          query={daily}
          empty={!hasData}
          accessory={
            <View style={styles.tinyBadge}>
              <Text style={{ color: palette[0], fontSize: 10 }}>
                {chart.unit.toUpperCase()}
              </Text>
            </View>
          }
        >
          <Trend
            key={`${did}-${range.from}-${range.to}`}
            points={chart.points}
            unit={chart.unit}
          />
        </Panel>
        <Panel
          title="Listening rhythm"
          note="The days you turn the volume up."
          query={daily}
          empty={!hasData}
        >
          <Bars points={totals.weekdays} color={palette[1]} />
        </Panel>
        <Panel
          title="Your listening calendar"
          note="A little music, every day."
          query={daily}
          empty={!hasData}
        >
          <ListeningCalendar
            key={`${did}-${range.from}-${range.to}`}
            points={points}
          />
        </Panel>

        <Panel
          title="On repeat"
          note="Your most played artists and tracks in this period."
          query={rankQuery}
          empty={rankRows.length === 0}
          accessory={<Feather name="repeat" color={palette[2]} size={18} />}
          controls={
            <View style={[styles.segment, { marginTop: 12 }]}>
              {(["artists", "tracks"] as const).map((value) => (
                <TouchableOpacity
                  key={value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: ranking === value }}
                  style={[
                    styles.segmentItem,
                    ranking === value && styles.segmentActive,
                  ]}
                  onPress={() => setRanking(value)}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      color: ranking === value ? colors.text : colors.textMuted,
                    }}
                  >
                    {value === "artists" ? "Top artists" : "Top tracks"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          }
        >
          <Ranking
            rows={rankRows}
            color={palette[2]}
            kind={ranking === "artists" ? "ArtistDetails" : "SongDetails"}
          />
        </Panel>
        <Panel
          title="Monthly totals"
          note="How your listening changes over time."
          query={daily}
          empty={!hasData}
        >
          <Bars points={totals.months} color={palette[2]} />
        </Panel>
        <Panel
          title="Music through the decades"
          note="Release decades of the music you played. Unknown release years are excluded."
          query={decades}
          empty={decadePoints.length === 0}
        >
          <Bars points={decadePoints} color={palette[3]} />
        </Panel>
        {!did && (
          <Panel
            title="Top scrobblers"
            note="The community’s most active listeners this period."
            query={listeners}
            empty={!listeners.data?.length}
          >
            {listeners.data?.map((listener, i) => (
              <TouchableOpacity
                key={listener.did ?? listener.id ?? i}
                style={styles.rankRow}
                disabled={!listener.did}
                onPress={() =>
                  listener.did &&
                  navigation.navigate("UserProfile", { did: listener.did })
                }
              >
                <Text style={styles.rankNumber}>{i + 1}</Text>
                <UserAvatar uri={listener.avatar} size={38} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1}>
                    {listener.displayName || listener.handle}
                  </Text>
                  <Text style={styles.rankSubtitle}>@{listener.handle}</Text>
                </View>
                <Text style={styles.count}>
                  {(listener.scrobbles ?? 0).toLocaleString()}
                </Text>
              </TouchableOpacity>
            ))}
          </Panel>
        )}
        <Text style={styles.footer}>Made of moments. Measured in music.</Text>
      </ScrollView>
      {custom && (
        <CustomRange
          value={range}
          onClose={() => setCustom(false)}
          onApply={setRange}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  back: { padding: 6, marginLeft: -6 },
  headerTitle: { flex: 1, fontSize: 19, fontWeight: "700" },
  content: { padding: 18, gap: 20, paddingBottom: 50 },
  hero: {
    borderRadius: 24,
    padding: 23,
    borderWidth: 1,
    borderColor: "#6f285b55",
  },
  heroBadge: { flexDirection: "row", alignItems: "center", gap: 7 },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  eyebrow: {
    color: "#ff94bd",
    letterSpacing: 2,
    fontSize: 10,
    fontWeight: "700",
  },
  heroTitle: {
    fontSize: 33,
    lineHeight: 39,
    fontWeight: "700",
    marginTop: 20,
    letterSpacing: -1,
  },
  heroNote: { color: "#bfa6c7", fontSize: 12, lineHeight: 19, marginTop: 12 },
  heroDate: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 23,
  },
  between: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  segment: {
    flexDirection: "row",
    borderRadius: 14,
    backgroundColor: colors.surface,
    padding: 4,
  },
  segmentItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 11,
    borderRadius: 10,
  },
  segmentActive: { backgroundColor: "#362049" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 11,
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#ffffff0c",
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 12,
  },
  stat: {
    width: "48%",
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: 17,
    padding: 15,
    borderTopWidth: 2,
  },
  statLabel: {
    fontSize: 8,
    letterSpacing: 0.6,
    color: "#bca7ca",
    flexShrink: 1,
  },
  statValue: {
    fontSize: 29,
    fontWeight: "700",
    marginTop: 13,
    fontVariant: ["tabular-nums"],
  },
  statNote: { color: "#a993b9", fontSize: 10, marginTop: 5, lineHeight: 15 },
  panel: {
    backgroundColor: colors.surface,
    borderRadius: 21,
    padding: 18,
    borderWidth: 1,
    borderColor: "#ffffff09",
  },
  panelTitle: { fontSize: 17, fontWeight: "700", flexShrink: 1 },
  note: {
    color: "#ae9bbc",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
    marginBottom: 6,
  },
  tinyBadge: {
    backgroundColor: "#fb3d8015",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  placeholder: { paddingVertical: 35, alignItems: "center", gap: 10 },
  retry: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: colors.surface3,
    borderRadius: 12,
  },
  rankRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
  },
  rankNumber: {
    color: "#9884aa",
    fontSize: 11,
    width: 18,
    fontVariant: ["tabular-nums"],
  },
  art: {
    width: 46,
    height: 46,
    borderRadius: 9,
    overflow: "hidden",
    backgroundColor: colors.surface3,
    alignItems: "center",
    justifyContent: "center",
  },
  rankSubtitle: { color: "#ae9bbc", fontSize: 11, marginTop: 3 },
  count: { fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"] },
  track: {
    height: 4,
    borderRadius: 3,
    backgroundColor: "#ffffff09",
    marginTop: 4,
  },
  footer: { color: "#8c769b", fontSize: 11, textAlign: "center", padding: 8 },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "#00000088",
  },
  sheet: {
    padding: 24,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: colors.surface,
  },
  inputLabel: { marginTop: 18, fontSize: 13, marginBottom: 8 },
  input: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.surface2,
    color: colors.text,
  },
  apply: {
    backgroundColor: colors.primary,
    borderRadius: 13,
    padding: 16,
    alignItems: "center",
    marginTop: 24,
  },
});
