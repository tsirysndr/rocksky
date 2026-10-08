import { useState } from "react";
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
  if (!events.length) return null;
  const visibleEvents = expanded ? events : events.slice(0, 9);

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
        {(events.length > 9 || query.hasNextPage) && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{
              disabled: query.isFetchingNextPage,
              expanded,
            }}
            disabled={query.isFetchingNextPage}
            style={styles.more}
            onPress={() => {
              if (!expanded) setExpandedArtist(artistUri);
              if (query.hasNextPage) void query.fetchNextPage();
              else if (expanded) setExpandedArtist(undefined);
            }}
          >
            <Text style={styles.moreText}>
              {query.isFetchingNextPage
                ? "Loading concerts…"
                : query.isFetchNextPageError
                  ? "Try again"
                  : expanded
                    ? query.hasNextPage
                      ? "View more upcoming concerts"
                      : "Show fewer concerts"
                    : `View all upcoming concerts (${events.length}${query.hasNextPage ? "+" : ""})`}
            </Text>
          </TouchableOpacity>
        )}
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
        return href ? (
          <TouchableOpacity
            key={event.uri}
            accessibilityRole="link"
            accessibilityLabel={label}
            style={styles.event}
            onPress={() =>
              Linking.openURL(href).catch(() =>
                Alert.alert("Unable to open link", "Please try again later."),
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
        );
      })}
      {query.isFetchNextPageError && (
        <Text accessibilityLiveRegion="polite" style={styles.meta}>
          Couldn’t load more events. Please try again.
        </Text>
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
    minHeight: 44,
    justifyContent: "center",
    maxWidth: 180,
    flexShrink: 1,
  },
  moreText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "right",
  },
  event: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginBottom: 24,
  },
  dateTile: {
    width: 80,
    height: 80,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 5,
    backgroundColor: "#282828",
    gap: 6,
  },
  month: { color: "#fff", fontSize: 16, fontWeight: "700" },
  day: { color: "#fff", fontSize: 32, lineHeight: 34, fontWeight: "800" },
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
