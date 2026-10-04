module.exports = {
  name: "Rocksky",
  slug: "rocksky",
  version: "2.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "rocksky",
  userInterfaceStyle: "dark",
  backgroundColor: "#130825",
  newArchEnabled: true,
  extra: {
    eas: {
      projectId: "b11aecfd-7217-4707-b0a8-6ad121c51bd4",
    },
  },
  ios: {
    supportsTablet: true,
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-icon.png",
      backgroundColor: "#130825",
    },
    package: "app.rocksky",
    versionCode: 3,
  },
  web: {
    bundler: "metro",
    output: "single",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 160,
        resizeMode: "contain",
        backgroundColor: "#130825",
      },
    ],
    "react-native-edge-to-edge",
  ],
};
