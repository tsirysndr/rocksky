import { NavigationContainer } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Constants from "expo-constants";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { RootStack } from "./Navigation";

const queryClient = new QueryClient();

const App = () => {
  useFonts({
    RockfordSansRegular: require("../assets/fonts/RockfordSans-Regular.otf"),
    RockfordSansMedium: require("../assets/fonts/RockfordSans-Medium.otf"),
    RockfordSansBold: require("../assets/fonts/RockfordSans-Bold.otf"),
  });

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <NavigationContainer>
          <RootStack />
        </NavigationContainer>
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
