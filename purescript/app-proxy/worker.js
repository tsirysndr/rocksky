import { iosAppNavigation } from "../../apps/shared/ios-app-navigation.mjs";
import { fetch } from '../output/Rocksky.AppProxy.Index/index.js';

export default {
  async fetch(request, env) {
    return iosAppNavigation(request, await fetch(request)(env)());
  },
};
