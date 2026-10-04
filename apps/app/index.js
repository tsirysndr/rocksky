import { registerRootComponent } from "expo";
import App from "./src/App";

registerRootComponent(App);

// Media-notification service. Guarded: if the installed binary predates the
// track-player native module (stale build + fresh JS), skip the notification
// instead of crashing at boot.
try {
  const TrackPlayer = require("react-native-track-player").default;
  const { playbackService } = require("./src/lib/playbackService");
  TrackPlayer.registerPlaybackService(() => playbackService);
} catch (e) {
  console.warn("media session unavailable:", e?.message ?? e);
}
