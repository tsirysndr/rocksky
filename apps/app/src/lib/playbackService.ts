import TrackPlayer, { Event } from "react-native-track-player";
import { reflectPlaying } from "./mediaSession";
import { remoteBridge } from "./remoteBridge";

// Headless handler for the media notification / lock-screen buttons: every
// press targets the current playback source through the bridge, never a broadcast.
export async function playbackService() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    if (remoteBridge.setPlaying(true)) void reflectPlaying(true);
  });
  TrackPlayer.addEventListener(Event.RemotePause, () => {
    if (remoteBridge.setPlaying(false)) void reflectPlaying(false);
  });
  TrackPlayer.addEventListener(Event.RemoteNext, () => {
    remoteBridge.send("next");
  });
  TrackPlayer.addEventListener(Event.RemotePrevious, () => {
    remoteBridge.send("previous");
  });
  TrackPlayer.addEventListener(Event.RemoteStop, () => {
    if (remoteBridge.setPlaying(false)) void reflectPlaying(false);
  });
}
