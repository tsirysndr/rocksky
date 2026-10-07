import Feather from "@expo/vector-icons/Feather";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { TouchableOpacity, View } from "react-native";
import { Text } from "@/src/components/Text";
import type { RootStackParamList } from "@/src/Navigation";
import { storage } from "@/src/storage";
import { colors } from "@/src/theme";

interface FloatingShoutBarProps {
  uri: string;
  type: "song" | "album" | "artist" | "profile" | "scrobble";
  title?: string;
}

export default function FloatingShoutBar({
  uri,
  type,
  title,
}: FloatingShoutBarProps) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <View
      style={{
        position: "absolute",
        bottom: 16,
        left: 16,
        right: 16,
        pointerEvents: "box-none",
      }}
      pointerEvents="box-none"
    >
      <TouchableOpacity
        onPress={() =>
          storage.getToken()
            ? navigation.navigate("ShoutEditor", { uri, type, title })
            : navigation.navigate("SignIn")
        }
        activeOpacity={0.85}
        style={{
          backgroundColor: colors.surface2,
          borderRadius: 28,
          paddingHorizontal: 16,
          paddingVertical: 12,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          borderWidth: 1,
          borderColor: colors.border,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.4,
          shadowRadius: 8,
          elevation: 8,
        }}
      >
        <Feather name="message-circle" size={20} color={colors.textMuted} />
        <Text style={{ color: colors.textMuted, fontSize: 14, flex: 1 }}>
          Add a shout...
        </Text>
      </TouchableOpacity>
    </View>
  );
}
