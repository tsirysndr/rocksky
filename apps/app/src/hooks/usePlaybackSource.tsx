import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useMemo } from "react";
import {
  activeDeviceIdAtom,
  devicesAtom,
  type PlaybackSource,
  type RemoteDevice,
  remoteCommandsAtom,
  selectedSourceAtom,
} from "../atoms/devices";
import { nowPlayingAtom, playerAtom } from "../atoms/nowplaying";
import {
  isLocalEngineAvailable,
  localQueue,
  localRemoteDeviceId,
} from "../lib/uploadEngine";

export const sameSource = (
  a: PlaybackSource | null,
  b: PlaybackSource,
): boolean =>
  a?.kind !== b.kind
    ? false
    : a.kind === "device" && b.kind === "device"
      ? a.id === b.id
      : true;

/**
 * Which source is current, and how to switch.
 *
 * Shared by the mini player and the full player so the two can never disagree
 * about what is selected: the derivation below is the only copy of it.
 */
export function usePlaybackSource() {
  const devices = useAtomValue(devicesAtom);
  const player = useAtomValue(playerAtom);
  const [activeDeviceId, setActiveDeviceId] = useAtom(activeDeviceIdAtom);
  const [picked, setPicked] = useAtom(selectedSourceAtom);
  const commands = useAtomValue(remoteCommandsAtom);
  const setNowPlaying = useSetAtom(nowPlayingAtom);
  const setPlayer = useSetAtom(playerAtom);

  // This phone registers itself on the remote socket too, so the registry holds
  // an entry for us; "This Device" already stands for it, so it is filtered out
  // rather than listed twice.
  const ownDeviceId = localRemoteDeviceId();
  const deviceList: RemoteDevice[] = useMemo(
    () =>
      Object.values(devices).filter(
        (device) => device.deviceId !== ownDeviceId,
      ),
    [devices, ownDeviceId],
  );
  const activeDevice = activeDeviceId ? devices[activeDeviceId] : undefined;
  const thisDeviceAvailable = isLocalEngineAvailable();

  // Whatever is actually playing wins over the last pick, so the mark always
  // points at the source producing sound; with nothing playing it falls back to
  // the pick, then to the server's primary device.
  const current: PlaybackSource | null =
    player === "local"
      ? { kind: "local" }
      : player === "spotify"
        ? { kind: "spotify" }
        : player === "rockbox" && activeDeviceId
          ? { kind: "device", id: activeDeviceId }
          : (picked ??
            (activeDeviceId ? { kind: "device", id: activeDeviceId } : null));

  const thisDeviceActive = sameSource(current, { kind: "local" });
  const spotifyActive = sameSource(current, { kind: "spotify" });

  const sourceLabel = thisDeviceActive
    ? "This Device"
    : spotifyActive
      ? "Spotify"
      : current?.kind === "device" && activeDevice
        ? activeDevice.name
        : "Select a device";

  // playerAtom is what the transport bridge routes on, so each pick sets it:
  // otherwise the buttons keep talking to the source that was playing before.
  const selectDevice = useCallback(
    (deviceId: string) => {
      setPicked({ kind: "device", id: deviceId });
      commands?.setPrimary(deviceId);
      const track = devices[deviceId]?.nowPlaying;
      setPlayer(track ? "rockbox" : null);
      // Drop the outgoing source's track at once: the new device fills this in
      // from its own state, and if it is idle the placeholder is the truth.
      if (!track) setNowPlaying(null);
    },
    [commands, devices, setNowPlaying, setPicked, setPlayer],
  );

  const selectThisDevice = useCallback(() => {
    setPicked({ kind: "local" });
    setActiveDeviceId(null);
    const queued = localQueue().length > 0;
    setPlayer(queued ? "local" : null);
    if (!queued) setNowPlaying(null);
  }, [setActiveDeviceId, setNowPlaying, setPicked, setPlayer]);

  const selectSpotify = useCallback(() => {
    setPicked({ kind: "spotify" });
    setActiveDeviceId(null);
  }, [setActiveDeviceId, setPicked]);

  /**
   * Whether audio settings can be applied to the current source.
   *
   * The remote protocol has no capability handshake — a player applies the
   * sections it implements and ignores the rest (§6.1) — so a registered player
   * always counts. Spotify is not one: playback happens in Spotify's own client,
   * which exposes no DSP, so there is nothing to send and the button is off.
   * This Device counts because its settings are stored and kept.
   */
  const supportsAudioSettings =
    current?.kind === "device" || current?.kind === "local";

  return {
    current,
    sourceLabel,
    thisDeviceActive,
    spotifyActive,
    thisDeviceAvailable,
    supportsAudioSettings,
    deviceList,
    activeDevice,
    selectDevice,
    selectThisDevice,
    selectSpotify,
  };
}
