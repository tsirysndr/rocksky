import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useNavigation, type NavigationProp } from "@react-navigation/native";
import { Alert, TouchableOpacity } from "react-native";
import { useStoryLike } from "../hooks/useStoryLike";
import type { RootStackParamList } from "../Navigation";
import { storage } from "../storage";
import { colors } from "../theme";
import { Text } from "./Text";

export default function TrackLikeButton({
  track,
  showCount = false,
  color = colors.textMuted,
}: {
  track: {
    trackUri?: string | null;
    trackId?: string | null;
    liked?: boolean;
    likesCount?: number;
  };
  showCount?: boolean;
  color?: string;
}) {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { liked, pending, toggle } = useStoryLike(track);
  const count = Math.max(
    0,
    (track.likesCount ?? 0) + Number(liked) - Number(!!track.liked),
  );
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={liked ? "Unlike track" : "Like track"}
      accessibilityState={{ selected: liked, disabled: pending }}
      disabled={pending}
      onPress={(event) => {
        event.stopPropagation();
        if (!storage.getToken()) {
          navigation.navigate("SignIn");
          return;
        }
        if (!track.trackUri && !track.trackId) {
          Alert.alert(
            "Track unavailable",
            "This scrobble has no song available to like yet.",
          );
          return;
        }
        toggle();
      }}
      style={{
        minWidth: 44,
        minHeight: 44,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        opacity: pending ? 0.6 : 1,
      }}
    >
      <MaterialCommunityIcons
        name={liked ? "heart" : "heart-outline"}
        size={22}
        color={liked ? colors.primary : color}
      />
      {showCount && count > 0 && (
        <Text style={{ fontSize: 11, color: liked ? colors.primary : color }}>
          {count}
        </Text>
      )}
    </TouchableOpacity>
  );
}
