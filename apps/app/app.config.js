const isTestBuild = process.env.ROCKSKY_VARIANT === "test";

module.exports = {
  name: isTestBuild ? "Rocksky Test" : "Rocksky",
  slug: "rocksky",
  version: "2.0.1",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: isTestBuild ? "rocksky-test" : "rocksky",
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
      backgroundImage: "./assets/images/icon-background.png",
      backgroundColor: "#130825",
    },
    package: isTestBuild ? "app.rocksky.test" : "app.rocksky",
    versionCode: 18,
  },
  web: {
    bundler: "metro",
    output: "single",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "./plugins/withAndroidIdentity",
    "./plugins/withRustEngine",
    "./plugins/withReleaseOptimization",
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 120,
        resizeMode: "contain",
        backgroundColor: "#130825",
      },
    ],
    "react-native-edge-to-edge",
    "expo-video",
  ],
};
