import ShareIcon from "../../components/ShareIcon";
import MaterialIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Image } from "expo-image";
import { TouchableOpacity, View } from "react-native";
import { discogsUrl } from "../../components/DiscogsDetails";
import { useAlbumQuery, useSongByUriQuery } from "../../hooks/useLibrary";
import type { Story } from "../../types/feed";
import { storyLinks } from "../../lib/storyLinks";

const logos = {
  MusicBrainz: require("../../../assets/images/musicbrainz.svg"),
  Discogs: require("../../../assets/images/discogs.svg"),
  PDSls: require("../../../assets/images/pdsls.webp"),
};

export default function StoryLinks({
  story,
  active,
  onOpen,
  onShare,
}: {
  story: Story;
  active: boolean;
  onOpen: (url: string) => void;
  onShare: () => void;
}) {
  const { data: song } = useSongByUriQuery(active ? story.trackUri || "" : "");
  const albumUri = song?.albumUri || story.albumUri || "";
  const album = /^at:\/\/([^/]+)\/app\.rocksky\.album\/([^/]+)$/.exec(albumUri);
  const { data: release } = useAlbumQuery(
    active ? album?.[1] || "" : "",
    album?.[2] || "",
  );
  const discogs = release?.discogs;
  const links = storyLinks({
    spotifyLink: song?.spotifyLink,
    mbId: song?.mbId,
    discogsLink:
      discogsUrl(discogs?.url, discogs?.releaseId) ||
      discogsUrl(
        discogs?.master?.url,
        discogs?.master?.masterId ?? discogs?.masterId,
        "master",
      ),
    uri: story.uri || story.trackUri,
  });
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "center",
        gap: 12,
        marginTop: 12,
        marginBottom: 10,
      }}
    >
      {links.map(({ name, url }) => (
        <TouchableOpacity
          key={name}
          accessibilityRole="link"
          accessibilityLabel={`Open in ${name}`}
          onPress={() => onOpen(url)}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: "#ffffff26",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {name === "Spotify" ? (
            <MaterialIcons name="spotify" size={25} color="#1DB954" />
          ) : (
            <Image
              source={logos[name]}
              contentFit="contain"
              style={{ width: 24, height: 24 }}
              tintColor={name === "Discogs" ? "#fff" : undefined}
            />
          )}
        </TouchableOpacity>
      ))}
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Share this story"
        accessibilityHint="Opens the card customization screen"
        onPress={onShare}
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: "#ffffff26",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ShareIcon size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}
