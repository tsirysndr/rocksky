import Feather from "@expo/vector-icons/Feather";
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
  const events = [
    ...new Map(
      query.data?.pages.flat().map((event) => [event.uri, event]),
    ).values(),
  ];
  if (!events.length) return null;

  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.heading}>
        On tour
      </Text>
      <Text style={styles.subtitle}>
        {artistName ? `See ${artistName} live` : "Upcoming events"}
      </Text>
      {events.map((event) => {
        const details = eventDetails(event);
        const href = eventLink(event);
        return (
          <View key={event.uri} style={styles.card}>
            <View
              style={styles.dateTile}
              accessible={false}
              importantForAccessibility="no-hide-descendants"
            >
              <Text style={styles.month}>{details.month.toUpperCase()}</Text>
              <Text style={styles.day}>{details.day}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.meta}>{details.date}</Text>
              <Text style={styles.name}>{event.name}</Text>
              <Text style={styles.meta}>{details.location}</Text>
              {details.status && (
                <Text style={styles.status}>{details.status}</Text>
              )}
              {href &&
                details.status !== "cancelled" &&
                details.status !== "postponed" && (
                  <TouchableOpacity
                    accessibilityRole="link"
                    accessibilityLabel={`${event.ticketsUrl === href ? "Find tickets" : "Event details"} for ${event.name}`}
                    style={styles.link}
                    onPress={() =>
                      Linking.openURL(href).catch(() =>
                        Alert.alert(
                          "Unable to open link",
                          "Please try again later.",
                        ),
                      )
                    }
                  >
                    <Text style={styles.linkText}>
                      {event.ticketsUrl === href
                        ? "Find tickets"
                        : "Event details"}
                    </Text>
                    <Feather
                      name="external-link"
                      size={14}
                      color={colors.text}
                    />
                  </TouchableOpacity>
                )}
            </View>
          </View>
        );
      })}
      {query.isFetchNextPageError && (
        <Text accessibilityLiveRegion="polite" style={styles.meta}>
          Couldn’t load more events. Please try again.
        </Text>
      )}
      {query.hasNextPage && (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ disabled: query.isFetchingNextPage }}
          disabled={query.isFetchingNextPage}
          onPress={() => query.fetchNextPage()}
          style={styles.more}
        >
          <Text style={styles.linkText}>
            {query.isFetchingNextPage
              ? "Loading…"
              : query.isFetchNextPageError
                ? "Try again"
                : "Show more events"}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginVertical: 24, paddingHorizontal: 16 },
  heading: { color: colors.text, fontSize: 20, fontWeight: "800" },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 4,
    marginBottom: 16,
  },
  card: {
    flexDirection: "row",
    gap: 14,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.surface2,
    marginBottom: 10,
  },
  dateTile: {
    width: 54,
    alignSelf: "flex-start",
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.background,
  },
  month: { color: colors.text, fontSize: 11, fontWeight: "600" },
  day: { color: colors.text, fontSize: 24, fontWeight: "800" },
  name: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
    marginVertical: 5,
  },
  meta: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  status: {
    color: colors.text,
    fontSize: 12,
    textTransform: "capitalize",
    marginTop: 8,
  },
  link: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    minHeight: 44,
    marginTop: 4,
  },
  linkText: { color: colors.text, fontSize: 13, fontWeight: "600" },
  more: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.textMuted,
    marginTop: 6,
  },
});
