import { createRoot } from "react-dom/client";
import { NowPlaying } from "./NowPlaying";
import { useReceiver } from "./useReceiver";
import { demoState } from "./fixtures";
import "./styles.css";
function Receiver() {
  const { state, toggle, seek } = useReceiver();
  return <NowPlaying state={state} onToggle={toggle} onSeek={seek} />;
}
const preview = new URLSearchParams(location.search).get("preview");
// Preview mode never starts a Cast session or requests media playback.
createRoot(document.getElementById("root")!).render(
  preview !== null ? (
    <NowPlaying
      state={
        preview === "idle"
          ? { ...demoState, phase: "idle", track: null }
          : demoState
      }
    />
  ) : (
    <Receiver />
  ),
);
