import Feather from "@expo/vector-icons/Feather";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSignOut } from "../hooks/useSignOut";
import type { RootStackParamList } from "../Navigation";
import type { AccountSection } from "../screens/Account/Account";
import { colors } from "../theme";
import { Text } from "./Text";

const items: {
  title: AccountSection;
  icon: React.ComponentProps<typeof Feather>["name"];
}[] = [
  ...(Platform.OS === "android"
    ? [{ title: "Scrobbling" as const, icon: "headphones" as const }]
    : []),
  { title: "API Keys", icon: "key" },
  { title: "Access tokens", icon: "lock" },
  { title: "Mirror sources", icon: "repeat" },
  { title: "Storage", icon: "hard-drive" },
  { title: "Wrapped", icon: "bar-chart-2" },
];
export default function ProfileDrawer({ onClose }: { onClose: () => void }) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const signOut = useSignOut();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <Pressable
          accessibilityLabel="Close menu"
          onPress={onClose}
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: "rgba(0,0,0,0.6)" },
          ]}
        />
        <SafeAreaView
          style={{
            width: "82%",
            maxWidth: 360,
            flex: 1,
            backgroundColor: colors.surface,
          }}
        >
          <View style={styles.header}>
            <Text style={{ fontSize: 22, fontWeight: "700" }}>Account</Text>
            <TouchableOpacity accessibilityLabel="Close menu" onPress={onClose}>
              <Feather name="x" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView>
            <TouchableOpacity
              style={styles.item}
              onPress={() => {
                onClose();
                navigation.navigate("Analytics");
              }}
            >
              <Feather name="activity" size={22} color={colors.textMuted} />
              <Text>Analytics</Text>
            </TouchableOpacity>
            {Platform.OS === "android" && (
              <TouchableOpacity style={styles.item} onPress={() => {
                onClose(); navigation.navigate("RendererSettings");
              }}>
                <Feather name="radio" size={22} color={colors.textMuted} />
                <Text>Media receiver</Text>
              </TouchableOpacity>
            )}
            {items.map(({ title, icon }) => (
              <TouchableOpacity
                key={title}
                style={styles.item}
                onPress={() => {
                  onClose();
                  navigation.navigate("Account", { section: title });
                }}
              >
                <Feather name={icon} size={22} color={colors.textMuted} />
                <Text>{title}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity
            style={styles.item}
            onPress={() => {
              onClose();
              void signOut().catch(() =>
                Alert.alert(
                  "Could not finish signing out",
                  "Please try again.",
                ),
              );
            }}
          >
            <Feather name="log-out" size={22} color={colors.primary} />
            <Text style={{ color: colors.primary }}>Sign out</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  header: {
    padding: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  item: { flexDirection: "row", alignItems: "center", gap: 16, padding: 22 },
});
