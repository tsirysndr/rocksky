const { withDangerousMod, withAndroidManifest } = require("@expo/config-plugins");
const fs = require("node:fs/promises");
const path = require("node:path");

// React Native's autolinking cache watches lockfiles, not Expo's package name.
// Invalidate only that generated file when changing production/test identity.
function removeOtherVariantScheme(config) {
  const unwanted = config.android.package === "app.rocksky.test" ? "rocksky" : "rocksky-test";
  for (const app of config.modResults.manifest.application ?? []) {
    for (const activity of app.activity ?? []) {
      activity["intent-filter"] = (activity["intent-filter"] ?? []).filter((filter) => {
        if (!filter.data?.some((data) => data.$?.["android:scheme"] === unwanted)) return true;
        filter.data = filter.data.filter((data) => data.$?.["android:scheme"] !== unwanted);
        return filter.data.length > 0;
      });
    }
  }
  return config;
}

module.exports = (config) => {
  // Expo appends schemes on incremental prebuilds. Remove the other variant's
  // stale scheme so the test app cannot intercept production deep links.
  config = withAndroidManifest(config, removeOtherVariantScheme);
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const cache = path.join(
        config.modRequest.platformProjectRoot,
        "build/generated/autolinking/autolinking.json",
      );
      try {
        const json = JSON.parse(await fs.readFile(cache, "utf8"));
        if (json.project?.android?.packageName !== config.android.package) {
          await fs.unlink(cache);
        }
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      return config;
    },
  ]);
};
