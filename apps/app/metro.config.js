const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// @rocksky/sdk is installed as a file: dependency symlinked into the monorepo;
// Metro only serves files it watches, so the real location must be watched.
config.watchFolders = [path.resolve(__dirname, "../../sdk/typescript")];

module.exports = config;
