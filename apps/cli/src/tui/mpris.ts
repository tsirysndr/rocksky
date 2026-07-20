import os from "os";
import { playerController } from "./player";

export interface MprisHandle {
  update(): void;
  close(): void;
}

/**
 * On Linux, expose the player over MPRIS (D-Bus) so desktop environments and
 * media keys can control it and show now-playing info. No-op everywhere else
 * (and if the `mpris-service` module or a D-Bus session isn't available).
 */
export async function initMpris(): Promise<MprisHandle | null> {
  if (os.platform() !== "linux") return null;

  let Player: any;
  try {
    Player = (await import("mpris-service")).default;
  } catch {
    return null;
  }

  let mpris: any;
  try {
    mpris = Player({
      name: "rocksky",
      identity: "Rocksky",
      supportedInterfaces: ["player"],
    });
  } catch {
    return null;
  }

  mpris.canControl = true;
  mpris.canPlay = true;
  mpris.canPause = true;
  mpris.canGoNext = true;
  mpris.canGoPrevious = true;
  mpris.canSeek = true;

  mpris.getPosition = () => {
    const s = playerController.status();
    return s ? (s.position_ms || 0) * 1000 : 0;
  };

  mpris.on("playpause", () => playerController.toggle());
  mpris.on("play", () => playerController.play());
  mpris.on("pause", () => playerController.pause());
  mpris.on("stop", () => playerController.pause());
  mpris.on("next", () => playerController.next());
  mpris.on("previous", () => playerController.previous());
  mpris.on("volume", (v: number) => playerController.setVolume(v));
  mpris.on("shuffle", (v: boolean) => {
    if (playerController.isShuffle() !== v) playerController.toggleShuffle();
  });
  mpris.on("seek", (offsetUs: number) => {
    const s = playerController.status();
    if (s) {
      playerController.seekMs(Math.max(0, (s.position_ms || 0) + offsetUs / 1000));
    }
  });
  mpris.on("position", (e: any) => {
    playerController.seekMs(Math.max(0, (e?.position || 0) / 1000));
  });

  let lastKey = "";
  function update() {
    const s = playerController.status();
    if (!s || s.state === "stopped") {
      if (mpris.playbackStatus !== "Stopped") mpris.playbackStatus = "Stopped";
      lastKey = "";
      return;
    }
    mpris.playbackStatus = s.state === "playing" ? "Playing" : "Paused";
    const item = playerController.currentItem();
    const key = `${s.index}:${item?.uploadId ?? ""}`;
    if (key !== lastKey) {
      lastKey = key;
      mpris.metadata = {
        "mpris:trackid": mpris.objectPath(`track/${s.index ?? 0}`),
        "mpris:length": (s.duration_ms || item?.duration || 0) * 1000,
        "xesam:title": item?.title || "Unknown",
        "xesam:artist": [item?.artist || ""],
        "xesam:albumArtist": [item?.albumArtist || item?.artist || ""],
        "xesam:album": item?.album || "",
        "mpris:artUrl": item?.albumArt || "",
      };
    }
  }

  function close() {
    try {
      mpris.playbackStatus = "Stopped";
    } catch {
      // process exit tears down the bus connection
    }
  }

  return { update, close };
}
