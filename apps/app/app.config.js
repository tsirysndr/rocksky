module.exports = {
  name: "Rocksky",
  slug: "rocksky",
  version: "1.1.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "rocksky",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  extra: {
    storybookEnabled: process.env.STORYBOOK_ENABLED,
    eas: {
      projectId: "b11aecfd-7217-4707-b0a8-6ad121c51bd4"
    }
  },
  ios: {
    supportsTablet: true,
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-icon.png",
      backgroundColor: "#130825",
    },
    edgeToEdgeEnabled: true,
    package: "app.rocksky",
    versionCode: 2,
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    ["expo-build-properties", {
      android: {
        packagingOptions: {
          jniLibs: { useLegacyPackaging: false },
        },
      },
    }],
    "expo-router",
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#130825",
      },
    ],
    "@sentry/react-native",
    "expo-font",
    "expo-web-browser"
  ],
  experiments: {
    typedRoutes: true,
  },
};
