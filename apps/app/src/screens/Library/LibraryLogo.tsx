import Feather from "@expo/vector-icons/Feather";
import { Image } from "expo-image";
import { View } from "react-native";
import type { LibraryKind } from "../../api/remoteLibraries";
import { colors } from "../../theme";

const logos = {
  navidrome: require("../../../assets/libraries/navidrome.png"),
  jellyfin: require("../../../assets/libraries/jellyfin.png"),
  kodi: require("../../../assets/libraries/kodi.png"),
  plex: require("../../../assets/libraries/plex.png"),
  upnp: require("../../../assets/libraries/upnp.png"),
};
export default function LibraryLogo({
  kind,
  size = 40,
}: {
  kind: LibraryKind | "device" | "uploaded";
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {kind === "device" || kind === "uploaded" ? (
        <Feather
          name={kind === "device" ? "smartphone" : "cloud"}
          size={size * 0.5}
          color={colors.textMuted}
        />
      ) : (
        <Image
          source={logos[kind]}
          style={{ width: size * 0.7, height: size * 0.7 }}
          contentFit="contain"
          tintColor={colors.textMuted}
        />
      )}
    </View>
  );
}
