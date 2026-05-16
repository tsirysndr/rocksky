import { NavigationContainer } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Constants from "expo-constants";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { storage } from "./storage";
import { colors } from "./theme";
import { RootStack } from "./Navigation";
import SignIn from "./screens/SignIn";
import { NowPlayingProvider } from "./providers/NowPlayingProvider";
import { useCurrentUserProfile } from "./hooks/useProfile";

const queryClient = new QueryClient();

function AppInner() {
  const [isReady, setIsReady] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const token = storage.getToken();

  useCurrentUserProfile(token);

  useEffect(() => {
    storage.load().then(({ token }) => {
      setIsLoggedIn(!!token);
      setIsReady(true);
    });
  }, []);

  if (!isReady) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  if (!isLoggedIn) {
    return (
      <SignIn
        onSuccess={() => setIsLoggedIn(true)}
      />
    );
  }

  return (
    <NowPlayingProvider>
      <NavigationContainer>
        <RootStack />
      </NavigationContainer>
    </NowPlayingProvider>
  );
}

const App = () => {
  useFonts({
    RockfordSansRegular: require("../assets/fonts/RockfordSans-Regular.otf"),
    RockfordSansMedium: require("../assets/fonts/RockfordSans-Medium.otf"),
    RockfordSansBold: require("../assets/fonts/RockfordSans-Bold.otf"),
  });

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <AppInner />
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
