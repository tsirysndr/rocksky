import { useRoute, type RouteProp } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../Navigation";
import { colors } from "../../theme";
import DeviceLibrary from "./DeviceLibrary";

export default function LocalAlbumDetails() {
  const route = useRoute<RouteProp<RootStackParamList, "LocalAlbumDetails">>();
  return (
    <SafeAreaView
      edges={["top"]}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <DeviceLibrary album={route.params} />
    </SafeAreaView>
  );
}
