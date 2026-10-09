import Feather from "@expo/vector-icons/Feather";
import {
  type RouteProp,
  useNavigation,
  useRoute,
} from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { ActivityIndicator, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { remoteLibraries } from "../../api/remoteLibraries";
import { Text } from "../../components/Text";
import type { RootStackParamList } from "../../Navigation";
import { colors } from "../../theme";
import RemoteLibrary from "./RemoteLibrary";

export default function RemoteLibraryDetails() {
  const route =
    useRoute<RouteProp<RootStackParamList, "RemoteLibraryDetails">>();
  const navigation = useNavigation();
  const libraries = useQuery({
    queryKey: ["remote-libraries"],
    queryFn: remoteLibraries.list,
  });
  const source = libraries.data?.sources.find(
    (s) => s.id === route.params.sourceId,
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <TouchableOpacity
        accessibilityLabel="Back to search"
        onPress={() => navigation.goBack()}
        style={{ padding: 16, flexDirection: "row", gap: 12 }}
      >
        <Feather name="arrow-left" size={22} color={colors.text} />
        <Text>{source?.name ?? "Remote library"}</Text>
      </TouchableOpacity>
      {source ? (
        <RemoteLibrary
          key={`${source.id}:${route.params.entry.id}`}
          source={source}
          initialPath={[route.params.entry]}
          sourceSwitcher={null}
        />
      ) : libraries.isPending ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <View style={{ padding: 16 }}>
          <Text>
            {libraries.isError
              ? "Could not load your libraries."
              : "This library has been disconnected."}
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}
