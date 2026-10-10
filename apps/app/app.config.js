const isTestBuild = process.env.ROCKSKY_VARIANT === "test";

module.exports = {
  name: isTestBuild ? "Rocksky Test" : "Rocksky",
  slug: "rocksky",
  version: "2.3.2",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: isTestBuild ? "rocksky-test" : "rocksky",
  userInterfaceStyle: "dark",
  backgroundColor: "#130825",
  newArchEnabled: true,
  extra: {
    // AcoustID application client key (not a user's submission key).
    acoustidClientKey:
      process.env.ACOUSTIC_ID_API_KEY ||
      process.env.EXPO_PUBLIC_ACOUSTID_API_KEY ||
      "",
    eas: {
      projectId: "b11aecfd-7217-4707-b0a8-6ad121c51bd4",
    },
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: isTestBuild ? "app.rocksky.test" : "app.rocksky",
    associatedDomains: isTestBuild ? [] : ["applinks:rocksky.app"],
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-icon.png",
      backgroundImage: "./assets/images/icon-background.png",
      backgroundColor: "#130825",
    },
    package: isTestBuild ? "app.rocksky.test" : "app.rocksky",
    versionCode: 36,
    intentFilters: isTestBuild
      ? []
      : ["rocksky.app", "m.rocksky.app"].map((host) => ({
          action: "VIEW",
          autoVerify: true,
          category: ["BROWSABLE", "DEFAULT"],
          data: ["https", "http"].flatMap((scheme) => [
            { scheme, host, pathPrefix: "/profile/" },
            ...["song", "track", "album", "artist", "scrobble"].map(
              (type) => ({ scheme, host, pathPattern: `/.*/${type}/.*` }),
            ),
          ]),
        })),
  },
  web: {
    bundler: "metro",
    output: "single",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    ["react-native-google-cast", {
      receiverAppId: process.env.GOOGLE_CAST_RECEIVER_APP_ID || "833D8703",
      androidPlayServicesCastFrameworkVersion: "22.3.1",
      expandedController: false,
    }],
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
