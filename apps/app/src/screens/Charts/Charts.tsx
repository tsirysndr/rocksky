import { type NavigationProp, useNavigation } from "@react-navigation/native";
import dayjs from "dayjs";
import numeral from "numeral";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  SafeAreaView,
  TouchableOpacity,
  View,
} from "react-native";
import { Text } from "@/src/components/Text";
import { useTopArtistsQuery, useTopTracksQuery } from "@/src/hooks/useLibrary";
import type { RootStackParamList } from "@/src/Navigation";
import { colors } from "@/src/theme";
import type { Artist } from "@/src/types/artist";
import type { Track } from "@/src/types/track";

function TrackItem({
  item,
  rank,
  onPress,
}: {
  item: Track;
  rank: number;
  onPress: (uri: string) => void;
}) {
  const cover = item.albumArt;
  const title = item.title;
  return (
    <TouchableOpacity
      onPress={() => item.uri && onPress(item.uri)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 10,
        paddingHorizontal: 16,
        gap: 12,
      }}
    >
      <Text
        style={{
          width: 24,
          textAlign: "center",
          fontSize: 12,
          fontWeight: "700",
          opacity: 0.4,
          color: colors.text,
        }}
      >
        {rank}
      </Text>
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 8,
          overflow: "hidden",
          backgroundColor: colors.surface2,
        }}
      >
        {cover ? (
          <Image source={{ uri: cover }} style={{ width: 44, height: 44 }} />
        ) : (
          <View
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ opacity: 0.2, fontSize: 18 }}>♪</Text>
          </View>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={1}
          style={{ fontSize: 14, fontWeight: "600", color: colors.text }}
        >
          {title}
        </Text>
        {item.artist && (
          <Text
            numberOfLines={1}
            style={{ fontSize: 12, color: colors.textMuted }}
          >
            {item.artist}
          </Text>
        )}
      </View>
      {item.playCount > 0 && (
        <Text style={{ fontSize: 12, color: colors.textMuted }}>
          {numeral(item.playCount).format("0,0")}
        </Text>
      )}
    </TouchableOpacity>
  );
}

function ArtistItem({
  item,
  rank,
  onPress,
}: {
  item: Artist;
  rank: number;
  onPress: (uri: string) => void;
}) {
  return (
    <TouchableOpacity
      onPress={() => item.uri && onPress(item.uri)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 10,
        paddingHorizontal: 16,
        gap: 12,
      }}
    >
      <Text
        style={{
          width: 24,
          textAlign: "center",
          fontSize: 12,
          fontWeight: "700",
          opacity: 0.4,
          color: colors.text,
        }}
      >
        {rank}
      </Text>
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          overflow: "hidden",
          backgroundColor: colors.surface2,
        }}
      >
        {item.picture ? (
          <Image
            source={{ uri: item.picture }}
            style={{ width: 44, height: 44 }}
          />
        ) : (
          <View
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ opacity: 0.2, fontSize: 18 }}>♬</Text>
          </View>
        )}
      </View>
      <Text
        numberOfLines={1}
        style={{ flex: 1, fontSize: 14, fontWeight: "600", color: colors.text }}
      >
        {item.name}
      </Text>
      {item.playCount > 0 && (
        <Text style={{ fontSize: 12, color: colors.textMuted }}>
          {numeral(item.playCount).format("0,0")}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const RANGES = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
] as const;

export default function Charts() {
  const [tab, setTab] = useState<"tracks" | "artists">("tracks");
  const [rangeDays, setRangeDays] = useState<number>(7);
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();

  // The all-time chart aggregate times out server-side and returns empty
  // lists, so the charts are always scoped to a date window.
  const { startDate, endDate } = useMemo(
    () => ({
      startDate: dayjs().subtract(rangeDays, "day").startOf("day").toDate(),
      endDate: dayjs().endOf("day").toDate(),
    }),
    [rangeDays],
  );

  const { data: tracksData, isLoading: tracksLoading } = useTopTracksQuery(
    0,
    50,
    startDate,
    endDate,
  );
  const { data: artistsData, isLoading: artistsLoading } = useTopArtistsQuery(
    0,
    50,
    startDate,
    endDate,
  );

  const tracks = tracksData?.tracks || [];
  const artists = artistsData?.artists || [];
  const loading = tab === "tracks" ? tracksLoading : artistsLoading;

  const onPressTrack = (uri: string) => {
    navigation.navigate("SongDetails", {
      uri: `at://${uri.replace("at://", "")}`,
    });
  };

  const onPressArtist = (uri: string) => {
    navigation.navigate("ArtistDetails", {
      uri: `at://${uri.replace("at://", "")}`,
    });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
        <Text
          style={{
            fontSize: 24,
            fontWeight: "800",
            color: colors.text,
            marginBottom: 16,
          }}
        >
          Charts
        </Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {(["tracks", "artists"] as const).map((t) => (
            <TouchableOpacity
              key={t}
              onPress={() => setTab(t)}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 6,
                borderRadius: 20,
                backgroundColor: tab === t ? colors.primary : colors.surface2,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: tab === t ? "#fff" : colors.textMuted,
                  textTransform: "capitalize",
                }}
              >
                {t}
              </Text>
            </TouchableOpacity>
          ))}
          <View style={{ flex: 1 }} />
          {RANGES.map(({ label, days }) => (
            <TouchableOpacity
              key={days}
              onPress={() => setRangeDays(days)}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 20,
                backgroundColor:
                  rangeDays === days ? colors.surface3 : "transparent",
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  color: rangeDays === days ? colors.text : colors.textMuted,
                }}
              >
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : tab === "tracks" ? (
        <FlatList
          data={tracks}
          keyExtractor={(item, i) => String(item.id || i)}
          renderItem={({ item, index }) => (
            <TrackItem item={item} rank={index + 1} onPress={onPressTrack} />
          )}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          data={artists}
          keyExtractor={(item, i) => String(item.id || i)}
          renderItem={({ item, index }) => (
            <ArtistItem item={item} rank={index + 1} onPress={onPressArtist} />
          )}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}
