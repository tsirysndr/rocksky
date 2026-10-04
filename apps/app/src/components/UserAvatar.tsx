import MaterialIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { colors } from "../theme";

type Props = {
  uri?: string | null;
  size?: number;
};

// Avatar with the shared fallback convention: a purple circle with a user
// icon when there is no usable picture (missing, /@jpeg stub, or load error).
export default function UserAvatar({ uri, size = 48 }: Props) {
  const [failed, setFailed] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset the load-error state whenever the avatar uri changes
  useEffect(() => {
    setFailed(false);
  }, [uri]);

  const usable = !!uri && !uri.endsWith("/@jpeg") && !failed;

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: "hidden",
        backgroundColor: colors.avatarBackground,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {usable ? (
        <Image
          source={uri}
          style={{ width: size, height: size }}
          contentFit="cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <MaterialIcons name="account" size={size * 0.62} color="#fff" />
      )}
    </View>
  );
}
