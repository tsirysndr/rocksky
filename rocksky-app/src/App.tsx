import Constants from "expo-constants";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

const App = () => {
  useFonts({
    RockfordSansRegular: require("../assets/fonts/RockfordSans-Regular.otf"),
  });

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <View className="flex-1 justify-center items-center">
        <Text className="font-rockford-regular text-[#fff]">Hello all!</Text>
      </View>
    </SafeAreaProvider>
  );
};

let AppEntryPoint = App;

if (Constants.expoConfig?.extra?.storybookEnabled === "true") {
  const Storybook = require("../.storybook").default;
  const StorybookApp = () => {
    useFonts({
      RockfordSansRegular: require("../assets/fonts/RockfordSans-Regular.otf"),
    });
    return <Storybook />;
  };
  AppEntryPoint = StorybookApp;
}

export default AppEntryPoint;
