import type { LinkingOptions } from "@react-navigation/native";
import type { RootStackParamList } from "../Navigation";
import { parseSharePath } from "./shareLinks";

export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [
    "rocksky://",
    "rocksky-test://",
    "https://rocksky.app",
    "https://m.rocksky.app",
    "http://rocksky.app",
    "http://m.rocksky.app",
  ],
  getStateFromPath(path) {
    const destination = parseSharePath(path);
    if (!destination) return undefined;
    // Keep the tab bar and mini player, plus a Home screen to go back to.
    return {
      routes: [
        {
          name: "HomeTabs",
          state: {
            routes: [
              {
                name: "HomeTab",
                state: {
                  index: 1,
                  routes: [{ name: "Home" }, destination],
                },
              },
            ],
          },
        },
      ],
    };
  },
};
