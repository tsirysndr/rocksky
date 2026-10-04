import TrackPlayer, { Event } from "react-native-track-player";
import { reflectPlaying } from "./mediaSession";
import { remoteBridge } from "./remoteBridge";

// Headless handler for the media notification / lock-screen buttons: every
// press is forwarded to the remote device (or Spotify) through the bridge.
export async function playbackService() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    if (!remoteBridge.isPlaying()) remoteBridge.togglePlayPause();
    void reflectPlaying(true);
  });
  TrackPlayer.addEventListener(Event.RemotePause, () => {
    if (remoteBridge.isPlaying()) remoteBridge.togglePlayPause();
    void reflectPlaying(false);
  });
  TrackPlayer.addEventListener(Event.RemoteNext, () => {
    remoteBridge.send("next");
  });
  TrackPlayer.addEventListener(Event.RemotePrevious, () => {
    remoteBridge.send("previous");
  });
  TrackPlayer.addEventListener(Event.RemoteStop, () => {
    if (remoteBridge.isPlaying()) {
      remoteBridge.togglePlayPause();
    }
    void reflectPlaying(false);
  });
}
