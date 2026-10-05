const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("node:fs/promises");
const path = require("node:path");

// React Native's autolinking cache watches lockfiles, not Expo's package name.
// Invalidate only that generated file when changing production/test identity.
module.exports = (config) =>
  withDangerousMod(config, [
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
