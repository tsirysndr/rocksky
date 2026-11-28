import { iosAppNavigation } from "../../apps/shared/ios-app-navigation.mjs";
import { fetch } from "../build/dev/javascript/rocksky_app_proxy/rocksky_app_proxy.mjs";

export default { async fetch(request, env) { return iosAppNavigation(request, await fetch(request, env)); } };
