import Feather from "@expo/vector-icons/Feather";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useState } from "react";
import { Platform, StyleSheet, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { remoteLibraries } from "../../api/remoteLibraries";
import { authTokenAtom } from "../../atoms/auth";
import { Text } from "../../components/Text";
import type { RootStackParamList } from "../../Navigation";
import { colors } from "../../theme";
import DeviceLibrary from "./DeviceLibrary";
import UploadedLibrary from "./Library";
import LibraryLogo from "./LibraryLogo";
import LibrarySources from "./LibrarySources";
import RemoteLibrary from "./RemoteLibrary";

export default function Library() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const signedIn = !!useAtomValue(authTokenAtom);
  const [source, setSource] = useState(
    Platform.OS === "android" ? "device" : "uploaded",
  );
  const [picker, setPicker] = useState<"select" | "add" | null>(null);
  const libraries = useQuery({
    queryKey: ["remote-libraries"],
    queryFn: remoteLibraries.list,
    enabled: Platform.OS === "android",
  });
  const remote = libraries.data?.sources.find((item) => item.id === source);
  const selected = remote
    ? source
    : source === "uploaded"
      ? "uploaded"
      : "device";
  const name =
    remote?.name ?? (selected === "device" ? "Local music" : "Uploaded music");
  const sourceSwitcher = Platform.OS === "android" && (
    <View style={styles.switcher}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`Select library, current library: ${name}`}
        accessibilityState={{ expanded: picker !== null }}
        onPress={() => setPicker("select")}
        style={styles.selector}
      >
        <LibraryLogo
          kind={remote?.kind ?? (selected === "device" ? "device" : "uploaded")}
          size={32}
        />
        <Text numberOfLines={1} style={styles.label}>
          {name}
        </Text>
        <Feather name="chevron-down" size={20} color={colors.text} />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => setPicker("add")}
        accessibilityRole="button"
        accessibilityLabel="Connect a library"
        style={styles.add}
      >
        <Feather name="plus" size={23} color={colors.text} />
      </TouchableOpacity>
    </View>
  );
  return (
    <SafeAreaView
      edges={["top"]}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      {remote ? (
        <RemoteLibrary
          key={remote.id}
          source={remote}
          sourceSwitcher={sourceSwitcher}
        />
      ) : selected === "device" ? (
        <DeviceLibrary sourceSwitcher={sourceSwitcher} />
      ) : (
        <UploadedLibrary sourceSwitcher={sourceSwitcher} />
      )}
      {picker && (
        <LibrarySources
          selected={selected}
          add={picker === "add"}
          onClose={() => setPicker(null)}
          onSelect={(id) => {
            setSource(id);
            setPicker(null);
            if (id === "uploaded" && !signedIn) navigation.navigate("SignIn");
          }}
        />
      )}
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  switcher: {
    flexDirection: "row",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
  },
  selector: {
    flex: 1,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
  },
  label: { flex: 1, color: colors.text, fontSize: 15, fontWeight: "600" },
  add: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
});
