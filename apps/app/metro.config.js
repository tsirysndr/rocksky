const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// @rocksky/sdk is installed as a file: dependency symlinked into the monorepo;
// Metro only serves files it watches, so the real location must be watched.
const sdkRoot = path.resolve(__dirname, "../../sdk/typescript");
config.watchFolders = [sdkRoot];

// Resolve the SDK's subpath exports explicitly — Metro's package-exports
// handling doesn't reliably follow them through bun's per-file symlinks.
const sdkEntries = {
  "@rocksky/sdk": path.join(sdkRoot, "dist/index.js"),
  "@rocksky/sdk/remote": path.join(sdkRoot, "dist/remote.js"),
  "@rocksky/sdk/dedup": path.join(sdkRoot, "dist/dedup.js"),
};

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (sdkEntries[moduleName]) {
    return { type: "sourceFile", filePath: sdkEntries[moduleName] };
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
