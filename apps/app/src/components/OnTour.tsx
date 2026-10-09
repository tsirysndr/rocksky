import Feather from "@expo/vector-icons/Feather";
import EventRsvpButton from "./EventRsvpButton";
import { useEffect, useState } from "react";
import {
  Alert,
  Linking,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Text } from "./Text";
import { useArtistEvents } from "../hooks/useArtistEvents";
import { eventDetails, eventLink } from "../types/event";
import { colors } from "../theme";

export default function OnTour({
  artistUri,
  artistName,
}: {
  artistUri?: string;
  artistName?: string;
}) {
  const query = useArtistEvents(artistUri);
  const [expandedArtist, setExpandedArtist] = useState<string>();
  const expanded = expandedArtist === artistUri;
  const events = [
    ...new Map(
      query.data?.pages.flat().map((event) => [event.uri, event]),
    ).values(),
  ];
  useEffect(() => {
    if (
      expanded &&
      query.hasNextPage &&
      !query.isFetching &&
      !query.isFetchNextPageError
    ) {
      void query.fetchNextPage();
    }
  }, [
    expanded,
    query.hasNextPage,
    query.isFetching,
    query.isFetchNextPageError,
    query.fetchNextPage,
  ]);
  const previewLimit = 3;
  if (!events.length) return null;
  const visibleEvents = expanded ? events : events.slice(0, previewLimit);

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text
          accessibilityRole="header"
          accessibilityLabel={artistName ? `On tour: ${artistName}` : "On tour"}
          style={styles.heading}
        >
          On Tour
        </Text>
      </View>
      {visibleEvents.map((event) => {
        const details = eventDetails(event);
        const href =
          details.status === "cancelled" || details.status === "postponed"
            ? undefined
            : eventLink(event);
        const content = (
          <>
            <View
              style={styles.dateTile}
              accessible={false}
              importantForAccessibility="no-hide-descendants"
            >
              <Text style={styles.month}>{details.month}</Text>
              <Text style={styles.day}>{details.day}</Text>
            </View>
            <View style={styles.info}>
              <Text numberOfLines={1} style={styles.city}>
                {details.city}
              </Text>
              <Text numberOfLines={1} style={styles.meta}>
                {details.lineup}
              </Text>
              <Text numberOfLines={1} style={styles.meta}>
                {details.schedule}
              </Text>
              {details.status && (
                <Text style={styles.status}>{details.status}</Text>
              )}
            </View>
          </>
        );
        const label = `${details.city}: ${event.name}, ${details.date}, ${details.location}. Times shown in your local timezone.`;
        return (
          <View key={event.uri} style={styles.row}>
            {href ? (
              <TouchableOpacity
                key={event.uri}
                accessibilityRole="link"
                accessibilityLabel={label}
                style={styles.event}
                onPress={() =>
                  Linking.openURL(href).catch(() =>
                    Alert.alert(
                      "Unable to open link",
                      "Please try again later.",
                    ),
                  )
                }
              >
                {content}
              </TouchableOpacity>
            ) : (
              <View
                key={event.uri}
                accessible
                accessibilityLabel={label}
                style={styles.event}
              >
                {content}
              </View>
            )}
            {details.status !== "cancelled" && (
              <EventRsvpButton event={event} />
            )}
          </View>
        );
      })}
      {(events.length > previewLimit || query.hasNextPage) && (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          style={styles.more}
          onPress={() => setExpandedArtist(expanded ? undefined : artistUri)}
        >
          <Text style={styles.moreText}>
            {expanded ? "Show fewer concerts" : "View all upcoming concerts"}
          </Text>
          <Feather
            name={expanded ? "chevron-up" : "chevron-down"}
            size={20}
            color={colors.text}
          />
        </TouchableOpacity>
      )}
      {expanded && query.isFetchingNextPage && (
        <Text accessibilityLiveRegion="polite" style={styles.meta}>
          Loading more concerts…
        </Text>
      )}
      {expanded && query.isFetchNextPageError && (
        <View>
          <Text accessibilityLiveRegion="polite" style={styles.meta}>
            Couldn’t load more events.
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.more}
            onPress={() => query.fetchNextPage()}
          >
            <Text style={styles.moreText}>Try again</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginVertical: 28, paddingHorizontal: 16 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 20,
  },
  heading: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  more: {
    minHeight: 48,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  moreText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
    flexShrink: 1,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 24 },
  event: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  dateTile: {
    width: 64,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 5,
    backgroundColor: colors.surface2,
    gap: 6,
  },
  month: { color: colors.text, fontSize: 16, fontWeight: "700" },
  day: { color: colors.text, fontSize: 32, lineHeight: 34, fontWeight: "800" },
  info: { flex: 1, minWidth: 0 },
  city: {
    color: colors.text,
    fontSize: 19,
    fontWeight: "700",
    marginBottom: 6,
  },
  meta: { color: colors.textMuted, fontSize: 16, lineHeight: 23 },
  status: {
    color: colors.textMuted,
    fontSize: 12,
    textTransform: "capitalize",
  },
});
