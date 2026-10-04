import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";
import { colors } from "../theme";
import { Text } from "./Text";

type Props = {
  /** The playlist's own picture; when set it wins over the mosaic. */
  picture?: string | null;
  /** Album art of up to four of its tracks, for the mosaic. */
  trackArts?: string[] | null;
  size: number;
};

/**
 * A playlist's cover: its own picture when it has one, otherwise a 2×2 mosaic
 * of four of its tracks' covers — or a single cover when it hasn't four.
 *
 * Mirrors the web client's PlaylistCover, so the same playlist looks the same
 * on both.
 */
export default function PlaylistCover({ picture, trackArts, size }: Props) {
  const arts = (trackArts ?? []).filter(Boolean);
  const radius = size > 48 ? 10 : 6;

  if (picture) {
    return (
      <View
        style={[
          styles.frame,
          { width: size, height: size, borderRadius: radius },
        ]}
      >
        <Image
          source={{ uri: picture }}
          style={{ width: size, height: size }}
          cachePolicy="memory-disk"
          recyclingKey={picture}
          contentFit="cover"
        />
      </View>
    );
  }

  if (arts.length === 0) {
    return (
      <View
        style={[
          styles.frame,
          styles.centre,
          { width: size, height: size, borderRadius: radius },
        ]}
      >
        <Text style={{ opacity: 0.25, fontSize: Math.round(size / 2.6) }}>
          ♪
        </Text>
      </View>
    );
  }

  // Four or one: a mosaic of two or three reads as a mistake rather than a
  // design, which is the rule the web cover follows too.
  const shown = arts.length >= 4 ? arts.slice(0, 4) : arts.slice(0, 1);
  const tile = shown.length === 4 ? size / 2 : size;

  return (
    <View
      style={[
        styles.frame,
        styles.mosaic,
        { width: size, height: size, borderRadius: radius },
      ]}
    >
      {shown.map((art, index) => (
        <Image
          // The same cover can appear twice in a mosaic, and this list is a
          // fixed snapshot of at most four, so position is the stable identity.
          // biome-ignore lint/suspicious/noArrayIndexKey: see above
          key={`${art}-${index}`}
          source={{ uri: art }}
          style={{ width: tile, height: tile }}
          cachePolicy="memory-disk"
          recyclingKey={art}
          contentFit="cover"
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: "hidden",
    backgroundColor: colors.surface2,
  },
  centre: {
    alignItems: "center",
    justifyContent: "center",
  },
  mosaic: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
});
