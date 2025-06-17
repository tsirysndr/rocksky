import { NavigationContainer } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Constants from "expo-constants";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { useSetAtom } from "jotai";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { didAtom } from "./atoms/did";
import { handleAtom } from "./atoms/handle";
import { RootStack } from "./Navigation";
import { NowPlayingProvider } from "./providers/NowPlayingProvider";

const queryClient = new QueryClient();

const App = () => {
  const setDid = useSetAtom(didAtom);
  const setHandle = useSetAtom(handleAtom);
  useFonts({
    RockfordSansRegular: require("../assets/fonts/RockfordSans-Regular.otf"),
    RockfordSansMedium: require("../assets/fonts/RockfordSans-Medium.otf"),
    RockfordSansBold: require("../assets/fonts/RockfordSans-Bold.otf"),
  });

  const getActiveRouteName = (state: any) => {
    if (!state || !state.routes) return null;

    const route = state.routes[state.index];

    // Dive into nested navigators
    if (route.state) {
      return getActiveRouteName(route.state);
    }

    return route.name;
  };

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <NowPlayingProvider>
          <StatusBar style="auto" />
          <NavigationContainer
            onStateChange={(state) => {
              const currentTab = getActiveRouteName(state);
              if (currentTab === "Profile" || currentTab === "Library") {
                setDid("did:plc:7vdlgi2bflelz7mmuxoqjfcr");
                setHandle(undefined);
              }
            }}
          >
            <RootStack />
          </NavigationContainer>
        </NowPlayingProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
};

let AppEntryPoint = App;

if (Constants.expoConfig?.extra?.storybookEnabled === "true") {
  const Storybook = require("../.storybook").default;
  const StorybookApp = () => {
    useFonts({
      RockfordSansRegular: require("../assets/fonts/RockfordSans-Regular.otf"),
      RockfordSansMedium: require("../assets/fonts/RockfordSans-Medium.otf"),
      RockfordSansBold: require("../assets/fonts/RockfordSans-Bold.otf"),
    });
    return <Storybook />;
  };
  AppEntryPoint = StorybookApp;
}

export default AppEntryPoint;
