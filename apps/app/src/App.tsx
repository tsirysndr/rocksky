import { DarkTheme, NavigationContainer } from "@react-navigation/native";
import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { authTokenAtom } from "./atoms/auth";
import StarrySplash from "./components/StarrySplash";
import { useNotificationAccess } from "./hooks/useNotificationAccess";
import { useCurrentUserProfile } from "./hooks/useProfile";
import { linking } from "./lib/linking";
import { queryClient } from "./lib/queryClient";
import { RootStack } from "./Navigation";
import { NowPlayingProvider } from "./providers/NowPlayingProvider";
import { storage } from "./storage";
import { colors } from "./theme";

SplashScreen.preventAutoHideAsync();

const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    primary: colors.primary,
    border: colors.border,
  },
};

const SPLASH_MIN_MS = 1800;

function AppInner({ fontsLoaded }: { fontsLoaded: boolean }) {
  const [storageReady, setStorageReady] = useState(false);
  const [minTimeDone, setMinTimeDone] = useState(false);
  const setAuthToken = useSetAtom(authTokenAtom);
  const token = useAtomValue(authTokenAtom);

  useCurrentUserProfile(token);

  useEffect(() => {
    // The native splash hands off to the animated StarrySplash right away.
    SplashScreen.hideAsync();
    storage.load().then(({ token }) => {
      setAuthToken(token);
      setStorageReady(true);
    });
    const timer = setTimeout(() => setMinTimeDone(true), SPLASH_MIN_MS);
    return () => clearTimeout(timer);
  }, [setAuthToken]);

  const showSplash = !storageReady || !fontsLoaded || !minTimeDone;
  useNotificationAccess(!showSplash && !!token);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {storageReady && (
        <NowPlayingProvider>
          <NavigationContainer theme={navigationTheme} linking={linking}>
            <RootStack />
          </NavigationContainer>
        </NowPlayingProvider>
      )}
      <StarrySplash visible={showSplash} />
    </View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    RockfordSansLight: require("../assets/fonts/RockfordSans-Light.otf"),
    RockfordSansRegular: require("../assets/fonts/RockfordSans-Regular.otf"),
    RockfordSansMedium: require("../assets/fonts/RockfordSans-Medium.otf"),
    RockfordSansBold: require("../assets/fonts/RockfordSans-Bold.otf"),
  });

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <AppInner fontsLoaded={fontsLoaded} />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
