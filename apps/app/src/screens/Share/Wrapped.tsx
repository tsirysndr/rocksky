import Feather from "@expo/vector-icons/Feather";
import { type RouteProp, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  getAnalyticsArtists,
  getAnalyticsDaily,
  getAnalyticsTracks,
} from "../../api/analytics";
import { Text } from "../../components/Text";
import type { ShareItem } from "../../lib/shareLinks";
import type { RootStackParamList } from "../../Navigation";
import { colors } from "../../theme";
import { dailyPoints, summarize } from "../Analytics/data";

export default function Wrapped({
  route,
}: {
  route?: RouteProp<RootStackParamList, "Wrapped">;
}) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(route?.params?.year ?? currentYear);
  const { did = "", name } = route?.params ?? {};
  useEffect(() => {
    setYear(route?.params?.year ?? currentYear);
  }, [route?.params?.year, did, currentYear]);
  const query = useQuery({
    queryKey: ["wrapped", did, year],
    enabled: !!did,
    queryFn: async ({ signal }): Promise<ShareItem> => {
      const scope = {
        did,
        range: {
          from: `${year}-01-01`,
          to:
            year === currentYear
              ? new Date().toISOString().slice(0, 10)
              : `${year}-12-31`,
          label: String(year),
        },
      };
      const [daily, artists, tracks] = await Promise.all([
        getAnalyticsDaily(scope, signal),
        getAnalyticsArtists(scope, signal),
        getAnalyticsTracks(scope, signal),
      ]);
      const { total, active } = summarize(dailyPoints(daily, scope.range));
      return {
        kind: "wrapped",
        uri: did,
        year,
        title: `${year} Wrapped`,
        subtitle: name || did,
        stats: [
          { label: "scrobbles", value: total.toLocaleString() },
          { label: "listening days", value: String(active) },
        ],
        rankings: [
          {
            label: "Top artists",
            names: artists.map((a) => a.name || "Unknown artist"),
          },
          {
            label: "Top tracks",
            names: tracks.map(
              (t) =>
                `${t.title || "Untitled track"} · ${t.artist || "Unknown artist"}`,
            ),
          },
        ],
      };
    },
  });
  const hasData = query.data?.rankings?.some((group) => group.names.length > 0);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 24 }}>
        <TouchableOpacity
          accessibilityLabel="Back"
          onPress={() => navigation.goBack()}
        >
          <Feather name="arrow-left" color={colors.text} size={26} />
        </TouchableOpacity>
        <Text style={{ fontSize: 38, fontWeight: "700", color: colors.text }}>
          Your year, on repeat.
        </Text>
        <Text style={{ color: colors.textMuted }}>
          Turn your listening history into a Wrapped card.
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <TouchableOpacity
            accessibilityLabel="Previous year"
            disabled={year <= 2000}
            onPress={() => setYear(year - 1)}
          >
            <Feather
              name="chevron-left"
              size={30}
              color={year <= 2000 ? colors.textMuted : colors.text}
            />
          </TouchableOpacity>
          <Text style={{ fontSize: 28, color: colors.text }}>{year}</Text>
          <TouchableOpacity
            accessibilityLabel="Next year"
            disabled={year >= currentYear}
            onPress={() => setYear(year + 1)}
          >
            <Feather
              name="chevron-right"
              size={30}
              color={year >= currentYear ? colors.textMuted : colors.text}
            />
          </TouchableOpacity>
        </View>
        {year === currentYear && (
          <Text style={{ color: colors.textMuted }}>
            Your year so far, through today.
          </Text>
        )}
        {query.isPending ? (
          <ActivityIndicator color={colors.primary} />
        ) : query.isError ? (
          <TouchableOpacity onPress={() => query.refetch()}>
            <Text>Couldn't load your Wrapped. Tap to retry.</Text>
          </TouchableOpacity>
        ) : !hasData ? (
          <Text>No listening history for {year} yet. Try another year.</Text>
        ) : (
          <>
            {query.data.stats?.map((stat) => (
              <View key={stat.label}>
                <Text
                  style={{
                    color: colors.primary,
                    fontSize: 40,
                    fontWeight: "700",
                  }}
                >
                  {stat.value}
                </Text>
                <Text>{stat.label}</Text>
              </View>
            ))}
            {query.data.rankings?.map((group) => (
              <View key={group.label} style={{ gap: 8 }}>
                <Text style={{ color: colors.textMuted }}>{group.label}</Text>
                {group.names.slice(0, 3).map((title, i) => (
                  <Text key={`${i}-${title}`} numberOfLines={2}>
                    {i + 1}. {title}
                  </Text>
                ))}
              </View>
            ))}
            <TouchableOpacity
              onPress={() =>
                navigation.navigate("ShareCard", { item: query.data })
              }
              style={{
                padding: 18,
                backgroundColor: colors.primary,
                borderRadius: 18,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "white", fontWeight: "700" }}>
                Create Wrapped card
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
