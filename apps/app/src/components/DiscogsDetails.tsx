import { useState } from "react";
import Feather from "@expo/vector-icons/Feather";
import {
  Alert,
  Linking,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Text } from "./Text";
import { colors } from "../theme";
import type { AlbumDiscogsView } from "@rocksky/sdk";

type Detail = { label: string; value: string };
type Section = { title: string; rows: Detail[] };
const text = (value: unknown): string => {
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(", ");
  return value === undefined || value === null ? "" : String(value).trim();
};
const rows = (values: [string, unknown][]): Detail[] =>
  values
    .map(([label, value]) => ({ label, value: text(value) }))
    .filter((row) => row.value !== "");
const join = (...values: unknown[]) =>
  values.map(text).filter(Boolean).join(" · ");
function discogsSections(d: AlbumDiscogsView): Section[] {
  return [
    {
      title: "Release",
      rows: rows([
        ["Title", d.title],
        ["Artist", d.artist],
        ["Release date", d.releaseDate],
        ["Year", d.year],
        ["Original year", d.originalYear],
        ["Country", d.country],
        ["Label", d.label],
        ["Catalog number", d.catalogNumber],
        ["Barcode", d.barcode],
        ["Formats", d.formats],
        ["Genres", d.genres],
        ["Styles", d.styles],
        ["Release ID", d.releaseId],
        ["Master ID", d.masterId],
        [
          "Match confidence",
          d.score === undefined || d.score === null ? undefined : `${d.score}%`,
        ],
      ]),
    },
    {
      title: "Artists",
      rows: (d.artists ?? []).map((a) => ({
        label: text(a.name) || "Artist",
        value: join(
          a.anv && `Credited as ${a.anv}`,
          a.role,
          a.joinPhrase && `Join: ${a.joinPhrase}`,
          a.artistId && `Discogs artist ${a.artistId}`,
        ),
      })),
    },
    {
      title: "Labels and companies",
      rows: (d.labels ?? []).map((l) => ({
        label: text(l.name) || "Label / company",
        value: join(
          l.entityType || l.kind,
          l.catalogNumber,
          l.labelId && `Discogs label ${l.labelId}`,
        ),
      })),
    },
    {
      title: "Identifiers",
      rows: (d.identifiers ?? []).map((i) => ({
        label: text(i.type) || "Identifier",
        value: join(i.value, i.description),
      })),
    },
    {
      title: "Credits",
      rows: (d.credits ?? []).map((c) => ({
        label: text(c.name) || "Credit",
        value: join(
          c.role,
          c.tracks && `Tracks: ${c.tracks}`,
          c.artistId && `Discogs artist ${c.artistId}`,
        ),
      })),
    },
    {
      title: "Discogs tracklist",
      rows: (d.tracklist ?? []).map((t) => ({
        label: join(t.position, t.title) || "Track",
        value: join(
          t.duration ||
            (t.durationMs !== undefined
              ? `${Math.floor(t.durationMs / 60000)}:${String(Math.floor(t.durationMs / 1000) % 60).padStart(2, "0")}`
              : undefined),
          t.discNumber && `Disc ${t.discNumber}`,
          t.trackNumber && `Track ${t.trackNumber}`,
          t.type && t.type !== "track" ? t.type : undefined,
        ),
      })),
    },
    {
      title: "Master release",
      rows: d.master
        ? rows([
            ["Title", d.master.title],
            ["Artist", d.master.artist],
            ["Year", d.master.year],
            ["Master ID", d.master.masterId],
            ["Main release ID", d.master.mainReleaseId],
            ["Genres", d.master.genres],
            ["Styles", d.master.styles],
          ])
        : [],
    },
  ].filter((section) => section.rows.length > 0);
}
function discogsUrl(
  url?: string,
  id?: number,
  kind = "release",
): string | undefined {
  if (url) {
    try {
      const parsed = new URL(url);
      if (
        parsed.protocol === "https:" &&
        ["discogs.com", "www.discogs.com"].includes(parsed.hostname)
      )
        return parsed.href;
    } catch {
      /* Use the release ID if the stored URL is invalid. */
    }
  }
  return id && Number.isSafeInteger(id) && id > 0
    ? `https://www.discogs.com/${kind}/${id}`
    : undefined;
}

export default function DiscogsDetails({
  discogs,
}: {
  discogs?: AlbumDiscogsView | null;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!discogs || Object.keys(discogs).length === 0) return null;
  const url = discogsUrl(discogs.url, discogs.releaseId);
  const masterUrl = discogsUrl(
    discogs.master?.url,
    discogs.master?.masterId ?? discogs.masterId,
    "master",
  );
  const open = async (link: string) => {
    try {
      await Linking.openURL(link);
    } catch {
      Alert.alert("Could not open link", "Please try again.");
    }
  };
  const links = [
    { label: "View on Discogs", url },
    { label: "View master release", url: masterUrl },
    {
      label: "Release artwork",
      url:
        discogs.albumArt && /^https:\/\//.test(discogs.albumArt)
          ? discogs.albumArt
          : undefined,
    },
  ];
  return (
    <View style={styles.container}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Discogs details"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((value) => !value)}
        style={styles.toggle}
      >
        <Text style={styles.heading}>Discogs details</Text>
        <Feather
          name={expanded ? "chevron-up" : "chevron-down"}
          size={20}
          color={colors.text}
        />
      </TouchableOpacity>
      {expanded && (
        <View>
          {discogsSections(discogs).map((section) => (
            <View key={section.title} style={styles.section}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>
                {section.title}
              </Text>
              {section.rows.map((row, i) => (
                <View key={`${row.label}-${i}`} style={styles.row}>
                  <Text selectable style={styles.label}>
                    {row.label}
                  </Text>
                  {!!row.value && (
                    <Text selectable style={styles.value}>
                      {row.value}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          ))}
          {links.map((link) =>
            link.url ? (
              <TouchableOpacity
                key={link.label}
                accessibilityRole="link"
                onPress={() => void open(link.url!)}
                style={styles.link}
              >
                <Text
                  style={{ color: colors.primary, fontSize: 14, flexShrink: 1 }}
                >
                  {link.label}
                </Text>
                <Feather
                  name="external-link"
                  size={16}
                  color={colors.primary}
                />
              </TouchableOpacity>
            ) : null,
          )}
        </View>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  container: {
    marginTop: 24,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  toggle: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    paddingVertical: 16,
  },
  heading: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
    flexShrink: 1,
  },
  section: { marginBottom: 24, gap: 12 },
  sectionTitle: { fontSize: 14, fontWeight: "600", color: colors.text },
  row: { gap: 4 },
  label: { fontSize: 13, color: colors.textMuted },
  value: { fontSize: 14, color: colors.text },
  link: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
  },
});
