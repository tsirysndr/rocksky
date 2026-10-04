import { registerRootComponent } from "expo";
import TrackPlayer from "react-native-track-player";
import App from "./src/App";
import { playbackService } from "./src/lib/playbackService";

registerRootComponent(App);
TrackPlayer.registerPlaybackService(() => playbackService);
