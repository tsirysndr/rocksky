import styled from "@emotion/styled";
import axios from "axios";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import _ from "lodash";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { nowPlayingAtom } from "../../atoms/nowpaying";
import { playerAtom } from "../../atoms/player";
import {
  activeDeviceIdAtom,
  deviceCommandAtom,
  devicesAtom,
  type RemoteDevice,
  type RemoteNowPlaying,
} from "../../atoms/devices";
import { playerControlsAtom } from "../../atoms/playerControls";
import { queueAtom, queueIndexAtom, queuePanelOpenAtom } from "../../atoms/queue";
import { fullscreenPlayerAtom } from "../../atoms/fullscreenPlayer";
import { profileAtom } from "../../atoms/profile";
import { shuffleAtom, repeatModeAtom, type RepeatMode } from "../../atoms/playback";
import { API_URL } from "../../consts";
import useLike from "../../hooks/useLike";
import useSpotify from "../../hooks/useSpotify";
import StickyPlayer from "./StrickyPlayer";
import FullscreenPlayer from "../FullscreenPlayer/FullscreenPlayer";
import { QueuePanel } from "../QueuePanel/QueuePanel";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { rocksky } from "../../lib/rocksky";
import { feedGeneratorUriAtom } from "../../atoms/feed";
import { InsertMode } from "rockbox-wasm";
import {
  RemoteController,
  type RemoteNowPlaying as SdkRemoteNowPlaying,
  type RemoteQueueItem as SdkRemoteQueueItem,
} from "@rocksky/sdk/remote";
import {
  ensureRockboxReady,
  getRockboxPlayer,
  moveInQueue,
  pinQueueIndex,
  publishRepeat,
  publishShuffle,
  registerTracks,
  streamUrlFor,
} from "../../lib/audio/rockbox-engine";
import { ensureStreamToken } from "../../api/uploads";
import { SILENT_AUDIO_DATA_URI } from "../../lib/audio/silence";
import { useRockboxEngine } from "../../hooks/useRockboxEngine";
import { useAudioSettingsPublisher } from "../../hooks/useAudioSettings";
import { useUploadResume } from "../../hooks/useUploadResume";
import { useUploadScrobble } from "../../hooks/useUploadScrobble";
import type { SongViewBasic } from "@rocksky/sdk";

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const QueueOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 101;
`;

const PlayerSelectorOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 9000;
`;

const PlayerSelectorPopup = styled.div`
  position: fixed;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
  z-index: 9001;
  padding: 8px 0;
  min-width: 180px;
  max-width: 320px;
  transform: translateX(-50%);
`;

const PlayerSelectorItem = styled.button<{ active: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 16px;
  border: none;
  background: ${({ active }) => active ? "color-mix(in srgb, var(--color-primary) 10%, transparent)" : "transparent"};
  color: ${({ active }) => active ? "var(--color-primary)" : "var(--color-text)"};
  font-size: 0.875rem;
  font-family: RockfordSansMedium;
  cursor: pointer;
  text-align: left;
  &:hover { background: var(--color-menu-hover); }
`;

const PlayerDot = styled.span<{ active: boolean }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: ${({ active }) => active ? "var(--color-primary)" : "var(--color-text-muted)"};
`;

// Keeps a device label (name — long song title) to a single line with ellipsis.
const PlayerSelectorLabel = styled.span`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

// A tick longer than this means the timer was throttled (backgrounded window)
// rather than merely late. Leaping the whole gap would overshoot; the next
// authoritative push corrects it within a couple of seconds anyway.
const MAX_TICK_MS = 2000;

// Reconciling the local progress estimate with a device's pushes: absorb this
// share of the error per push, and treat anything past the threshold as a seek
// to follow rather than drift to smooth out.
const DEVICE_SLEW_GAIN = 0.25;
const DEVICE_RESYNC_MS = 2000;

// ---------------------------------------------------------------------------
// StickyPlayerWithData
// ---------------------------------------------------------------------------

// Build the miniplayer's now-playing shape from a device's `track` payload.
// `prev` (the same device's previous state) lets us keep the smooth local
// progress and only snap on a track change or a large (seek) jump.
function toRemoteNowPlaying(
  track: SdkRemoteNowPlaying,
  liked: Record<string, boolean>,
  prev?: RemoteNowPlaying | null,
): RemoteNowPlaying {
  const title = track.title;
  const artist = track.albumArtist || track.artist;
  const incoming = track.elapsedMs ?? 0;
  const sameTrack = !!prev && prev.title === title && prev.artist === artist;
  // Reconcile the locally-ticked estimate against the device's authoritative
  // elapsed by BENDING toward it, not by choosing one or the other. Holding the
  // local value (as this used to) leaves a permanent offset that never
  // converges; snapping to the device's makes the bar visibly jump every push.
  // Take a fraction of the error instead, and never let it move backwards.
  const local = prev?.progress ?? incoming;
  const error = incoming - local;
  const progress = !sameTrack
    ? incoming
    : Math.abs(error) > DEVICE_RESYNC_MS
      // Too far out to be drift — somebody seeked on the device.
      ? incoming
      : Math.max(local, local + error * DEVICE_SLEW_GAIN);
  const isPlaying =
    typeof track.isPlaying === "boolean" ? track.isPlaying : (prev?.isPlaying ?? true);
  const songUri = track.songUri ?? "";
  return {
    title,
    artist,
    artistUri: track.artistUri ?? "",
    songUri,
    albumUri: track.albumUri ?? "",
    album: track.album,
    duration: track.durationMs ?? 0,
    progress,
    albumArt: track.albumArt,
    isPlaying,
    sha256: track.sha256 ?? "",
    liked: liked[songUri] !== undefined ? liked[songUri] : !!track.liked,
    codec: track.codec,
    sampleRate: track.sampleRate,
  };
}

// Map a device's queue item (SDK shape) to the QueueTrack shape the QueuePanel
// renders.
function toRemoteQueueTrack(q: SdkRemoteQueueItem) {
  return {
    uploadId: q.uploadId || q.trackId || "",
    title: q.title ?? "",
    artist: q.albumArtist || q.artist || "",
    albumArtist: q.albumArtist ?? "",
    album: q.album ?? "",
    albumArt: q.albumArt ?? null,
    duration: q.durationMs ?? 0,
    sha256: "",
    songUri: q.songUri ?? "",
    trackNumber: q.trackNumber ?? null,
  };
}

function StickyPlayerWithData() {
  useUploadScrobble();
  // Bridge the in-browser rockbox-wasm engine → jotai atoms (track/progress/
  // status/queue events). Replaces the old GraphQL polling entirely.
  useRockboxEngine();
  // Persist the upload queue + position to localStorage and rehydrate it on
  // reload (the engine is reloaded lazily on the next play — see onPlay).
  useUploadResume();
  // Keep the engine's DSP chain (EQ/tone/crossfade/…) in sync with the saved
  // audio settings from app load, so opening Audio Settings applies nothing new.
  useAudioSettingsPublisher();
  const queryClient = useQueryClient();
  const feedUri = useAtomValue(feedGeneratorUriAtom);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  // Initial heart state for local/upload playback: the engine only knows the
  // file, not whether the viewer loved the song. Fetch the loved set once
  // (sha256-keyed) and seed nowPlaying.liked from it; explicit heart clicks
  // (the `liked` map above) always win.
  const { data: lovedByHash } = useQuery({
    queryKey: ["lovedSha256s"],
    queryFn: async () => {
      const did = localStorage.getItem("did");
      if (!did) return new Map<string, string>();
      // Page through the whole loved list — a single capped request silently
      // truncates for anyone with a large library, and a missing entry reads
      // as "not loved".
      const PAGE = 1000;
      const MAX_PAGES = 10;
      const songs: SongViewBasic[] = [];
      for (let page = 0; page < MAX_PAGES; page++) {
        const batch = await rocksky().lovedSongs(did, PAGE, page * PAGE);
        songs.push(...batch);
        if (batch.length < PAGE) break;
      }
      // sha256 -> at:// uri, so a track with no songUri (Navidrome library
      // entries) can still be recognized as loved and un-loved.
      return new Map(
        songs
          .filter((s) => !!s.sha256)
          .map((s) => [s.sha256 as string, s.uri ?? ""] as const),
      );
    },
    enabled: !!localStorage.getItem("did"),
    staleTime: 5 * 60_000,
  });
  const [nowPlaying, setNowPlaying] = useAtom(nowPlayingAtom);
  const lastFetchedRef = useRef(0);
  const nowPlayingInterval = useRef<number | null>(null);
  const { play, pause, next, previous, seek } = useSpotify();
  const { like, unlike } = useLike();
  const [player, setPlayer] = useAtom(playerAtom);
  const nowPlayingRef = useRef(nowPlaying);
  const playerRef = useRef(player);
  const likedRef = useRef(liked);
  const profile = useAtomValue(profileAtom);
  // Remote controllable device (the Rocksky CLI, or the Rockbox daemon) on the
  // /ws relay: now-playing streams in over the socket and transport is sent back
  // as commands, so the web miniplayer stays in sync with the device. The SDK's
  // RemoteController owns the socket lifecycle (register handshake, heartbeat,
  // auto-reconnect + state resync); we just wire its events to the atoms below.
  const controllerRef = useRef<RemoteController | null>(null);
  // Every connected player device (device_id → state), plus which one is active
  // (= the user's primary). A user can run several players at once; each has its
  // own entry so their states never conflict, and the picker can switch between
  // them.
  const [devices, setDevices] = useAtom(devicesAtom);
  const [activeDeviceId, setActiveDeviceId] = useAtom(activeDeviceIdAtom);
  const devicesRef = useRef(devices);
  const activeDeviceIdRef = useRef(activeDeviceId);
  // Hidden silent <audio> that plays while the wasm engine plays, so the
  // browser surfaces the Media Session / OS media controls (Web Audio alone
  // doesn't trigger them).
  const silentRef = useRef<HTMLAudioElement>(null);

  // The in-browser rockbox queue (mirrored from the wasm engine's events).
  const [queue, setQueue] = useAtom(queueAtom);
  const [queueIndex, setQueueIndex] = useAtom(queueIndexAtom);
  const [queuePanelOpen, setQueuePanelOpen] = useAtom(queuePanelOpenAtom);
  const [fullscreenOpen, setFullscreenOpen] = useAtom(fullscreenPlayerAtom);
  const [shuffle, setShuffle] = useAtom(shuffleAtom);
  const [repeatMode, setRepeatMode] = useAtom(repeatModeAtom);

  // Local volume/mute mirror of the engine's output gain.
  const [volume, setVolumeState] = useState(1);
  const [muted, setMutedState] = useState(false);
  // The active remote device's reported volume (0–1). `null` means the device
  // doesn't advertise one — the protocol omits the field for players with no
  // volume control, and the slider is hidden rather than shown wrong.
  const [deviceVolume, setDeviceVolume] = useState<number | null>(null);
  // Suppress the device's echo briefly after a local slider move, so a stale
  // ~2s-old push can't snap the thumb back mid-drag.
  const lastLocalVolumeAt = useRef(0);
  // Same pattern for shuffle and repeat: the device's own state, mirrored from
  // its pushes; `null` means the device doesn't advertise the control and the
  // button is hidden rather than shown wrong.
  const [deviceShuffle, setDeviceShuffle] = useState<boolean | null>(null);
  const [deviceRepeat, setDeviceRepeat] = useState<"off" | "all" | "one" | null>(null);
  const lastLocalShuffleAt = useRef(0);
  const lastLocalRepeatAt = useRef(0);

  // Player selector
  const [playerSelectorOpen, setPlayerSelectorOpen] = useState(false);
  const speakerRef = useRef<HTMLButtonElement>(null);
  // The fullscreen player renders its own copy of the speaker button; the
  // device-select popup anchors to whichever one is currently on screen.
  const fullscreenSpeakerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    nowPlayingRef.current = nowPlaying;
    playerRef.current = player;
    likedRef.current = liked;
    devicesRef.current = devices;
    activeDeviceIdRef.current = activeDeviceId;
  }, [nowPlaying, player, liked, devices, activeDeviceId]);

  // A different device's volume means nothing here — hide the slider until the
  // newly-picked device's first push reports its own.
  useEffect(() => {
    setDeviceVolume(null);
    setDeviceShuffle(null);
    setDeviceRepeat(null);
  }, [activeDeviceId]);

  // Publish shuffle/repeat to whichever player is the source. For the local
  // engine there is no player/ready guard: publish* remembers the value and
  // (re)applies it on the engine's next init, so repeat "all" set before the
  // first play still loops the queue instead of stopping at the end.
  useEffect(() => {
    // A device's shuffle is its own state, mirrored from its pushes and driven
    // by onToggleShuffle — don't impose the local atom on it.
    if (playerRef.current === "device") return;
    publishShuffle(shuffle);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shuffle, player]);

  useEffect(() => {
    if (playerRef.current === "device") return;
    publishRepeat(repeatMode === "one" ? 1 : repeatMode === "all" ? 2 : 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repeatMode, player]);

  // Progress ticker for Spotify and remote devices — rockbox progress comes
  // from the engine's own `progress` events, so skip it there to avoid double-
  // counting. For a remote device we tick locally between the device's periodic
  // now-playing pushes (which reconcile any drift).
  useEffect(() => {
    let last = Date.now();
    const id = window.setInterval(() => {
      // Advance by the time that actually passed, not by the interval we asked
      // for. setInterval fires late under render load, so a fixed +100 drifts
      // BEHIND real time — and every authoritative push from the device then
      // yanked the bar forward to catch up.
      const now = Date.now();
      const delta = Math.min(now - last, MAX_TICK_MS);
      last = now;
      setNowPlaying((prev) => {
        if (!prev || !prev.isPlaying) return prev;
        const p = playerRef.current;
        if (p !== "spotify" && p !== "device") return prev;
        if (prev.progress >= prev.duration) {
          if (p === "spotify") setTimeout(fetchCurrentlyPlaying, 2000);
          return prev;
        }
        return { ...prev, progress: Math.min(prev.progress + delta, prev.duration) };
      });
    }, 100);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Spotify polling ───────────────────────────────────────────────────────

  const fetchCurrentlyPlaying = useCallback(async () => {
    const currentPlayer = playerRef.current;
    if (currentPlayer === "rockbox" || currentPlayer === "device") return;
    const { data } = await axios.get(`${API_URL}/spotify/currently-playing`, {
      headers: { authorization: `Bearer ${localStorage.getItem("token")}` },
    });
    if (data.item) {
      if (playerRef.current !== null && playerRef.current !== "spotify") return;
      setNowPlaying({
        title: data.item.name,
        artist: data.item.artists[0].name,
        artistUri: data.artistUri,
        songUri: data.songUri,
        albumUri: data.albumUri,
        album: _.get(data, "item.album.name"),
        duration: data.item.duration_ms,
        progress: data.progress_ms,
        albumArt: _.get(data, "item.album.images.0.url"),
        isPlaying: data.is_playing,
        sha256: data.sha256,
        liked: likedRef.current[data.songUri] !== undefined ? likedRef.current[data.songUri] : data.liked,
      });
      setPlayer("spotify");
    } else {
      if (playerRef.current === "spotify") { setNowPlaying(null); setPlayer(null); }
    }
    lastFetchedRef.current = Date.now();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setNowPlaying]);

  useEffect(() => {
    if (player === "rockbox") return;
    if (nowPlayingInterval.current) clearInterval(nowPlayingInterval.current);
    nowPlayingInterval.current = window.setInterval(() => { fetchCurrentlyPlaying(); }, 15000);
    fetchCurrentlyPlaying();
    return () => { if (nowPlayingInterval.current) clearInterval(nowPlayingInterval.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Remote device over the /ws relay ──────────────────────────────────────
  // Send a transport command to the active device. Seek carries its position in
  // `args` because the relay forwards only { type, action, args }.
  // Transport command → the ACTIVE device only (targeted, so controlling one
  // player never disturbs the others). Seek carries its position in `args`.
  const sendDeviceCommand = useCallback((action: string, args?: unknown) => {
    controllerRef.current?.command(action, activeDeviceIdRef.current ?? undefined, args);
  }, []);

  // Publish the device-command bridge so library context menus (Play / Play Next
  // / Add to queue …) can enqueue on the active remote device instead of the
  // local engine. `active` is true only while a device is the current player.
  const setDeviceCommand = useSetAtom(deviceCommandAtom);
  useEffect(() => {
    setDeviceCommand({
      active: player === "device" && !!activeDeviceId,
      send: sendDeviceCommand,
    });
  }, [player, activeDeviceId, sendDeviceCommand, setDeviceCommand]);

  // Adopt `id` as the active device the miniplayer shows. Called on a server
  // `primary_changed` (keeps every client in sync). It does NOT steal focus from
  // Spotify / the local engine — it only mirrors into the miniplayer when the
  // device source is (or becomes) active.
  const adoptDevice = useCallback((id: string, map?: Record<string, RemoteDevice>) => {
    setActiveDeviceId(id);
    const dev = (map ?? devicesRef.current)[id];
    if (!dev) return;
    if (playerRef.current === null || playerRef.current === "device") {
      if (dev.nowPlaying) setNowPlaying(dev.nowPlaying);
      setPlayer("device");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The user picked a device in the source selector → show/control it AND make it
  // the primary (scrobble source), synced to the server + the user's other UIs.
  const selectDevice = useCallback((id: string) => {
    setActiveDeviceId(id);
    const dev = devicesRef.current[id];
    if (dev?.nowPlaying) setNowPlaying(dev.nowPlaying);
    setPlayer("device");
    controllerRef.current?.setPrimary(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    // The SDK owns the socket lifecycle: register handshake, `ping` heartbeat,
    // auto-reconnect (which also covers the backgrounded-tab timeout — its
    // reconnect flushes on foreground and re-registers, and the server re-sends
    // the `devices` snapshot), device-id capture, and state resync. We just wire
    // its typed events to the same atom updates the old handleMessage performed.
    const controller = new RemoteController({
      token: () => localStorage.getItem("token") ?? undefined,
      name: "rocksky-web",
      url: `${API_URL.replace("https", "wss").replace("http", "ws")}/ws`,
    });
    controllerRef.current = controller;

    controller
      // Snapshot of the players already streaming when we connected.
      .on("devices", ({ primaryDevice, devices }) => {
        const map: Record<string, RemoteDevice> = {};
        for (const d of devices) {
          if (!d.deviceId) continue;
          map[d.deviceId] = {
            deviceId: d.deviceId,
            name: d.name || "Remote device",
            nowPlaying: d.nowPlaying
              ? toRemoteNowPlaying(d.nowPlaying, likedRef.current)
              : null,
            queue: Array.isArray(d.queue) ? d.queue.map(toRemoteQueueTrack) : [],
            queueIndex: d.queueIndex ?? 0,
          };
        }
        setDevices(map);
        if (primaryDevice && map[primaryDevice]) adoptDevice(primaryDevice, map);
      })
      // A player pushed a track → upsert its entry in the device map.
      .on("nowPlaying", ({ deviceId, deviceName, track }) => {
        if (!deviceId) return;
        if (!track.title && !track.artist && !track.albumArtist) return;
        const name = deviceName || "Remote device";
        const prevNp = devicesRef.current[deviceId]?.nowPlaying ?? null;
        const np = toRemoteNowPlaying(track, likedRef.current, prevNp);
        setDevices((prev) => {
          const prevDev = prev[deviceId];
          return {
            ...prev,
            [deviceId]: {
              deviceId,
              name,
              nowPlaying: np,
              queue: prevDev?.queue ?? [],
              queueIndex: prevDev?.queueIndex ?? 0,
            },
          };
        });
        // Mirror into the miniplayer when this is the active device. If nothing
        // is playing yet (player === null), promote the device source — this also
        // covers the race where `primaryChanged` arrived before the first track.
        if (
          activeDeviceIdRef.current === deviceId &&
          (playerRef.current === "device" || playerRef.current === null)
        ) {
          setNowPlaying(np);
          if (playerRef.current === null) setPlayer("device");
          lastFetchedRef.current = Date.now();
          if (Date.now() - lastLocalVolumeAt.current > 2500) {
            setDeviceVolume(track.volume ?? null);
          }
          if (Date.now() - lastLocalShuffleAt.current > 2500) {
            setDeviceShuffle(track.shuffle ?? null);
          }
          if (Date.now() - lastLocalRepeatAt.current > 2500) {
            setDeviceRepeat(track.repeat ?? null);
          }
        }
      })
      // Transport status for a device.
      .on("status", ({ deviceId, status }) => {
        if (!deviceId) return;
        const playing = status === "playing";
        setDevices((prev) => {
          const dev = prev[deviceId];
          if (!dev?.nowPlaying) return prev;
          return { ...prev, [deviceId]: { ...dev, nowPlaying: { ...dev.nowPlaying, isPlaying: playing } } };
        });
        if (activeDeviceIdRef.current === deviceId && playerRef.current === "device") {
          setNowPlaying((prev) => prev ? { ...prev, isPlaying: playing } : prev);
        }
      })
      // A player pushed its queue → mirror it (kept per-device for the panel).
      .on("queue", ({ deviceId, deviceName, index, queue }) => {
        if (!deviceId) return;
        const q = Array.isArray(queue) ? queue.map(toRemoteQueueTrack) : [];
        const queueIndex = index ?? 0;
        setDevices((prev) => {
          const dev = prev[deviceId] ?? {
            deviceId,
            name: deviceName || "Remote device",
            nowPlaying: null,
            queue: [],
            queueIndex: 0,
          };
          return { ...prev, [deviceId]: { ...dev, queue: q, queueIndex } };
        });
      })
      // A device left → drop it; if it was active, clear the miniplayer.
      .on("deviceUnregistered", ({ deviceId }) => {
        if (!deviceId) return;
        setDevices((prev) => {
          if (!prev[deviceId]) return prev;
          const next = { ...prev };
          delete next[deviceId];
          return next;
        });
        if (activeDeviceIdRef.current === deviceId) {
          setActiveDeviceId(null);
          if (playerRef.current === "device") { setNowPlaying(null); setPlayer(null); }
        }
      })
      // The primary device changed (this client, another client, or auto-adopt)
      // → converge on it.
      .on("primaryChanged", ({ deviceId }) => {
        if (deviceId) adoptDevice(deviceId);
      });

    controller.connect();

    return () => {
      controller.disconnect();
      controllerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Start playback at `idx` of the UI queue.
   *
   *  The engine can be empty while the UI queue is full — the queue is
   *  restored from localStorage on load, but the audio engine only gets it
   *  when playback actually starts (and on desktop the native engine is a
   *  separate process that a webview reload doesn't repopulate). Rebuild it
   *  in that case; otherwise a plain skip is enough. */
  const startAtIndex = async (idx: number, seekMs = 0) => {
    if (!queue.length) return;
    const p = await ensureRockboxReady();
    await ensureStreamToken();
    registerTracks(queue);
    const urls = queue.map(streamUrlFor);
    const target = Math.min(Math.max(0, idx), urls.length - 1);
    if (p.queue.length === urls.length) {
      p.skipTo(target);
    } else {
      // Cue the chosen track first so audio starts as soon as possible, then
      // fill the rest around it (the engine fetches those lazily).
      p.setQueue([urls[target]], true);
      const after = urls.slice(target + 1);
      const before = urls.slice(0, target);
      if (after.length) p.insert(after, InsertMode.PlayLast);
      if (before.length) p.insert(before, InsertMode.Prepend);
    }
    if (seekMs > 1000) {
      const onceTrack = () => {
        p.off("track", onceTrack);
        try { p.seek(seekMs); } catch { /* not seekable yet */ }
      };
      p.on("track", onceTrack);
    }
  };

  // ── Playback controls ─────────────────────────────────────────────────────

  const onPlay = async () => {
    if (player === "device") {
      sendDeviceCommand("play");
      setNowPlaying((prev) => prev ? { ...prev, isPlaying: true } : prev);
      return;
    }
    if (player === "rockbox") {
      const p = await ensureRockboxReady();
      // Resume after a reload: the queue was rehydrated from localStorage but
      // the engine is empty. Rebuild the engine queue at the saved index and
      // seek to the saved elapsed time once the track is decoded.
      if (p.queue.length === 0 && queue.length > 0) {
        await startAtIndex(queueIndex, nowPlaying?.progress ?? 0);
        setNowPlaying((prev) => prev ? { ...prev, isPlaying: true } : prev);
        return;
      }
      p.play();
      setNowPlaying((prev) => prev ? { ...prev, isPlaying: true } : prev);
      return;
    }
    play();
  };

  const onPause = () => {
    if (player === "device") {
      sendDeviceCommand("pause");
      setNowPlaying((prev) => prev ? { ...prev, isPlaying: false } : prev);
      return;
    }
    if (player === "rockbox") {
      getRockboxPlayer().pause();
      setNowPlaying((prev) => prev ? { ...prev, isPlaying: false } : prev);
      return;
    }
    pause();
  };

  const onNext = () => {
    if (player === "device") {
      sendDeviceCommand("next");
      return;
    }
    if (player === "rockbox") {
      getRockboxPlayer().next();
      return;
    }
    next();
  };

  const onPrevious = () => {
    if (player === "device") {
      sendDeviceCommand("previous");
      return;
    }
    if (player === "rockbox") {
      getRockboxPlayer().prev();
      return;
    }
    previous();
  };

  const onSeek = (position: number) => {
    if (player === "device") {
      sendDeviceCommand("seek", { position });
      setNowPlaying((prev) => prev ? { ...prev, progress: position } : prev);
      return;
    }
    if (player === "rockbox") {
      getRockboxPlayer().seek(position);
      setNowPlaying((prev) => prev ? { ...prev, progress: position } : prev);
      return;
    }
    seek(position);
  };

  // ── Volume ────────────────────────────────────────────────────────────────

  const onVolumeChange = (v: number) => {
    setVolumeState(v);
    if (v > 0 && muted) setMutedState(false);
    // A remote device has its own output — drive it over the protocol rather
    // than spinning up the local engine (which isn't the thing making sound).
    if (player === "device") {
      lastLocalVolumeAt.current = Date.now();
      setDeviceVolume(v);
      sendDeviceCommand("volume", { volume: muted ? 0 : v });
      return;
    }
    const p = getRockboxPlayer();
    if (p.ready) p.setVolume(muted ? 0 : v);
  };

  const onToggleShuffle = () => {
    if (player === "device") {
      const next = !(deviceShuffle ?? false);
      lastLocalShuffleAt.current = Date.now();
      setDeviceShuffle(next);
      sendDeviceCommand("shuffle", { enabled: next });
      return;
    }
    setShuffle((s) => !s);
  };

  const onCycleRepeat = () => {
    if (player === "device") {
      const cur = deviceRepeat ?? "off";
      const next = cur === "off" ? "all" : cur === "all" ? "one" : "off";
      lastLocalRepeatAt.current = Date.now();
      setDeviceRepeat(next);
      sendDeviceCommand("repeat", { mode: next });
      return;
    }
    setRepeatMode((r: RepeatMode) => (r === "off" ? "all" : r === "all" ? "one" : "off"));
  };

  const onToggleMute = () => {
    const nextMuted = !muted;
    setMutedState(nextMuted);
    if (player === "device") {
      lastLocalVolumeAt.current = Date.now();
      sendDeviceCommand("volume", { volume: nextMuted ? 0 : (deviceVolume ?? volume) });
      return;
    }
    const p = getRockboxPlayer();
    if (p.ready) p.setVolume(nextMuted ? 0 : volume);
  };

  // ── Global keyboard-shortcut bridge ───────────────────────────────────────
  // Publish stable transport wrappers so the app-wide shortcut handler can
  // drive playback (see components/KeyboardShortcuts). The transport closures
  // are captured through a ref so the published callbacks stay referentially
  // stable; controls are cleared when nothing is playing so media shortcuts
  // stay inert on pages with no active track.
  const setPlayerControls = useSetAtom(playerControlsAtom);
  const transportRef = useRef({
    onPlay,
    onPause,
    onNext,
    onPrevious,
    onToggleMute,
    onSeek,
  });
  transportRef.current = {
    onPlay,
    onPause,
    onNext,
    onPrevious,
    onToggleMute,
    onSeek,
  };
  const hasNowPlaying = !!nowPlaying;
  useEffect(() => {
    if (!hasNowPlaying) {
      setPlayerControls(null);
      return;
    }
    setPlayerControls({
      toggle: () =>
        nowPlayingRef.current?.isPlaying
          ? transportRef.current.onPause()
          : transportRef.current.onPlay(),
      next: () => transportRef.current.onNext(),
      previous: () => transportRef.current.onPrevious(),
      toggleMute: () => transportRef.current.onToggleMute(),
      seekBy: (deltaMs) => {
        const np = nowPlayingRef.current;
        if (!np) return;
        const max = np.duration ?? Number.MAX_SAFE_INTEGER;
        const target = Math.min(Math.max(0, (np.progress ?? 0) + deltaMs), max);
        transportRef.current.onSeek(target);
      },
    });
    return () => setPlayerControls(null);
  }, [hasNowPlaying, setPlayerControls]);

  useEffect(() => {
    if (!lovedByHash) return;
    if (player !== "rockbox") return;
    setNowPlaying((prev) => {
      if (!prev?.sha256) return prev;
      const key = prev.songUri || prev.sha256;
      // A manual heart click on this song wins over the fetched snapshot.
      if (liked[key] !== undefined) return prev;
      const isLoved = lovedByHash.has(prev.sha256);
      // Adopt the resolved uri so the heart can act on this track.
      const uri = prev.songUri || lovedByHash.get(prev.sha256) || "";
      if (prev.liked === isLoved && prev.songUri === uri) return prev;
      return { ...prev, liked: isLoved, songUri: uri };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lovedByHash, player, nowPlaying?.sha256]);

  // Library tracks streamed from Navidrome have no at:// URIs, so the
  // miniplayer can't link the title/artist/album (and the heart has no
  // subject). Resolve them once per track from the canonical record.
  const resolvedUriRef = useRef<string | null>(null);
  useEffect(() => {
    if (player !== "rockbox") return;
    const np = nowPlayingRef.current;
    if (!np?.title || !np.artist) return;
    if (np.songUri && np.artistUri && np.albumUri) return;
    const key = np.sha256 || `${np.title}::${np.artist}`;
    if (resolvedUriRef.current === key) return;
    resolvedUriRef.current = key;
    let cancelled = false;
    rocksky()
      .matchSong(np.title, np.artist)
      .then((song) => {
        if (cancelled || !song) return;
        setNowPlaying((prev) => {
          if (!prev || (prev.sha256 || `${prev.title}::${prev.artist}`) !== key) return prev;
          return {
            ...prev,
            songUri: prev.songUri || song.uri || "",
            artistUri: prev.artistUri || song.artistUri || "",
            albumUri: prev.albumUri || song.albumUri || "",
            albumArt: prev.albumArt || song.albumArt || undefined,
            sha256: prev.sha256 || song.sha256 || "",
          };
        });
      })
      .catch(() => {
        // Unresolvable (offline / not in the catalog yet) — leave as plain text.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, nowPlaying?.title, nowPlaying?.artist, nowPlaying?.songUri]);

  // ── Like / dislike ────────────────────────────────────────────────────────

  /** The at:// uri for the playing track. Library entries streamed from
   *  Navidrome carry none, so fall back to the loved-set lookup and finally
   *  to matchSong, which resolves canonical metadata by title + artist. */
  const resolveSongUri = async (uri: string): Promise<string> => {
    if (uri) return uri;
    const np = nowPlayingRef.current;
    if (!np) return "";
    const known = np.sha256 ? lovedByHash?.get(np.sha256) : undefined;
    if (known) return known;
    if (!np.title || !np.artist) return "";
    try {
      const song = await rocksky().matchSong(np.title, np.artist);
      return song?.uri ?? "";
    } catch {
      return "";
    }
  };

  const onLike = async (uri: string) => {
    const resolved = await resolveSongUri(uri);
    if (!resolved) return;
    setLiked({ ...liked, [resolved]: true });
    like(resolved);
    setNowPlaying((prev) =>
      prev ? { ...prev, liked: true, songUri: prev.songUri || resolved } : prev,
    );
    await queryClient.invalidateQueries({ queryKey: ["infiniteFeed", feedUri] });
    await queryClient.invalidateQueries({ queryKey: ["lovedSha256s"] });
  };

  const onDislike = async (uri: string) => {
    const resolved = await resolveSongUri(uri);
    if (!resolved) return;
    setLiked({ ...liked, [resolved]: false });
    unlike(resolved);
    setNowPlaying((prev) =>
      prev ? { ...prev, liked: false, songUri: prev.songUri || resolved } : prev,
    );
    await queryClient.invalidateQueries({ queryKey: ["lovedSha256s"] });
  };

  // ── Media Session API — lock-screen / OS media controls ───────────────────
  // Mirrors the sticky player: title, artist, album + artwork, live play/pause
  // state, a scrubbable position, and every transport action.

  // Album for the OS metadata: from the active remote device's current queue
  // track when a device is the source, else the local engine's queue.
  const activeDevice = activeDeviceId ? devices[activeDeviceId] : undefined;
  const album =
    player === "device"
      ? (activeDevice?.queue[activeDevice.queueIndex]?.album ?? "")
      : queue[queueIndex]?.album;

  // Metadata (track identity + artwork).
  useEffect(() => {
    if (!("mediaSession" in navigator) || !nowPlaying) return;
    const art = nowPlaying.albumArt;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: nowPlaying.title,
      artist: nowPlaying.artist,
      album: album ?? "",
      artwork: art
        ? [
            { src: art, sizes: "96x96" },
            { src: art, sizes: "256x256" },
            { src: art, sizes: "512x512" },
          ]
        : [],
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowPlaying?.title, nowPlaying?.artist, nowPlaying?.albumArt, album]);

  // Transport action handlers (re-bound when the active engine changes so the
  // right backend is driven).
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const set = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);
    // Drive the silent anchor SYNCHRONOUSLY here (this runs inside the media-key
    // user gesture) so resume works — the deferred sync effect can't call
    // play() in-gesture and would be blocked by the autoplay policy.
    set("play", () => { silentRef.current?.play().catch(() => {}); onPlay(); });
    set("pause", () => { silentRef.current?.pause(); onPause(); });
    set("previoustrack", onPrevious);
    set("nexttrack", onNext);
    try {
      set("seekto", (d) => {
        if (typeof d.seekTime === "number") onSeek(Math.floor(d.seekTime * 1000));
      });
      set("seekbackward", (d) =>
        onSeek(Math.max(0, (nowPlayingRef.current?.progress ?? 0) - (d.seekOffset ?? 10) * 1000)),
      );
      set("seekforward", (d) =>
        onSeek((nowPlayingRef.current?.progress ?? 0) + (d.seekOffset ?? 10) * 1000),
      );
    } catch {
      // older browsers may not support these actions
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  // Live play/pause state.
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = nowPlaying?.isPlaying ? "playing" : "paused";
  }, [nowPlaying?.isPlaying]);

  // Keep the silent Media Session anchor playing whenever a source that relies on
  // it is playing — the local wasm engine ("rockbox") OR a remote device
  // ("device"). A live media element is what lets the OS surface the media
  // controls; without it they never appear for the remote player.
  useEffect(() => {
    const el = silentRef.current;
    if (!el) return;
    if (
      (player === "rockbox" || player === "device") &&
      nowPlaying?.isPlaying
    ) {
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [player, nowPlaying?.isPlaying]);

  // Scrubber position (units: mediaSession wants seconds; nowPlaying is ms).
  useEffect(() => {
    if (!("mediaSession" in navigator) || !navigator.mediaSession.setPositionState) return;
    const dur = nowPlaying?.duration ?? 0;
    const pos = nowPlaying?.progress ?? 0;
    if (dur <= 0) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: dur / 1000,
        position: Math.min(pos, dur) / 1000,
        playbackRate: 1,
      });
    } catch {
      // invalid values (e.g. position > duration mid-transition) — ignore
    }
  }, [nowPlaying?.progress, nowPlaying?.duration]);

  // Playback ending unmounts the overlay but leaves the atom set, so the next
  // track would open fullscreen on its own.
  useEffect(() => {
    if (!nowPlaying) setFullscreenOpen(false);
  }, [nowPlaying, setFullscreenOpen]);

  // Registered remote devices make the bar worth showing even with nothing
  // playing — it is how you reach the device picker to adopt one. With no
  // track AND no devices there is nothing to show or do.
  const hasDevices = Object.keys(devices).length > 0;
  if (!nowPlaying && !hasDevices) return <></>;

  const isRockbox = player === "rockbox";
  // The "…" track menu belongs to the players this app drives. Spotify is
  // controlled by Spotify — its queue is not ours to reorder, and the library
  // ids the menu's entries need do not exist for it.
  const showTrackMenu = isRockbox || player === "device";
  // The queue entry for what is playing. A remote device's queue is its own —
  // the local atom is not the source of truth then — so pick the same way the
  // album name above does.
  const trackQueued =
    player === "device"
      ? activeDevice?.queue[activeDevice.queueIndex]
      : queue[queueIndex];
  // Show the queue button for the local engine OR a remote device with a queue.
  const showQueue = isRockbox || (player === "device" && !!activeDevice?.queue.length);

  return (
    <>
      {/* Silent Media Session anchor for the Web Audio (engine) playback path. */}
      <audio ref={silentRef} src={SILENT_AUDIO_DATA_URI} loop preload="auto" />

      {queuePanelOpen && isRockbox && (
        <>
          <QueueOverlay onClick={() => setQueuePanelOpen(false)} />
          <QueuePanel
            queue={queue}
            queueIndex={queueIndex}
            onClose={() => setQueuePanelOpen(false)}
            onPlayIndex={(idx) => {
              const track = queue[idx];
              if (!track) return;
              // Optimistic UI: flip the index + now-playing immediately, and
              // pin the index so a late status from the outgoing track can't
              // revert the "up next" the user just selected.
              pinQueueIndex(idx);
              setQueueIndex(idx);
              setNowPlaying({
                title: track.title,
                artist: track.artist,
                artistUri: "",
                songUri: track.songUri ?? "",
                albumUri: "",
                duration: track.duration,
                progress: 0,
                albumArt: track.albumArt ?? undefined,
                isPlaying: true,
                sha256: track.sha256,
                liked: false,
              });
              void startAtIndex(idx);
            }}
            onRemove={(idx) => {
              getRockboxPlayer().removeAt(idx);
            }}
            onReorder={(newQueue, from, to) => {
              // Optimistic UI; the engine applies the same move (remove +
              // indexed re-insert), so its next `queue` event confirms it.
              moveInQueue(from, to);
              setQueue(newQueue);
            }}
          />
        </>
      )}

      {/* Remote device queue: the real CLI/device queue, kept in sync via `queue`
          pushes. Actions are relayed to that device as targeted commands. */}
      {queuePanelOpen && player === "device" && activeDevice && (
        <>
          <QueueOverlay onClick={() => setQueuePanelOpen(false)} />
          <QueuePanel
            queue={activeDevice.queue}
            queueIndex={activeDevice.queueIndex}
            onClose={() => setQueuePanelOpen(false)}
            onPlayIndex={(idx) => sendDeviceCommand("queue_jump", { index: idx })}
            onRemove={(idx) => sendDeviceCommand("queue_remove", { index: idx })}
            onReorder={(_newQueue, from, to) => {
              // Optimistic reorder of the mirrored queue; the device applies
              // the move and its next `queue` push confirms the same order.
              const id = activeDevice.deviceId;
              setDevices((prev) => {
                const dev = prev[id];
                if (!dev || from >= dev.queue.length || to >= dev.queue.length) return prev;
                const q = dev.queue.slice();
                const [item] = q.splice(from, 1);
                q.splice(to, 0, item);
                return { ...prev, [id]: { ...dev, queue: q } };
              });
              sendDeviceCommand("queue_move", { from, to });
            }}
          />
        </>
      )}

      {fullscreenOpen && nowPlaying && (
        <FullscreenPlayer
          nowPlaying={nowPlaying}
          onPlay={onPlay}
          onPause={onPause}
          onPrevious={onPrevious}
          onNext={onNext}
          onSpeaker={() => setPlayerSelectorOpen((o) => !o)}
          speakerRef={fullscreenSpeakerRef}
          onSeek={onSeek}
          isPlaying={nowPlaying?.isPlaying ?? false}
          onLike={onLike}
          onDislike={onDislike}
          showQueueButton={showQueue}
          queuePanelOpen={queuePanelOpen}
          onPlaylist={() => setQueuePanelOpen((o) => !o)}
          onClose={() => setFullscreenOpen(false)}
          isUploadPlayer={isRockbox}
          showVolume={isRockbox || (player === "device" && deviceVolume !== null)}
          showShuffle={isRockbox || (player === "device" && deviceShuffle !== null)}
          showRepeat={isRockbox || (player === "device" && deviceRepeat !== null)}
          showTrackMenu={showTrackMenu}
          trackQueued={trackQueued}
          volume={player === "device" ? (deviceVolume ?? volume) : volume}
          muted={muted}
          onVolumeChange={onVolumeChange}
          onToggleMute={onToggleMute}
          shuffle={player === "device" ? (deviceShuffle ?? false) : shuffle}
          repeatMode={player === "device" ? (deviceRepeat ?? "off") : repeatMode}
          onShuffle={onToggleShuffle}
          onRepeat={onCycleRepeat}
        />
      )}

      {playerSelectorOpen && (() => {
        const anchor = fullscreenOpen
          ? fullscreenSpeakerRef.current
          : speakerRef.current;
        const rect = anchor?.getBoundingClientRect();
        const left = rect ? rect.left + rect.width / 2 : 100;
        const bottom = rect ? window.innerHeight - rect.top + 8 : 140;
        return createPortal(
          <>
            <PlayerSelectorOverlay onClick={() => setPlayerSelectorOpen(false)} />
            <PlayerSelectorPopup style={{ left, bottom }}>
              {profile?.spotifyConnected && (
                <PlayerSelectorItem
                  active={player === "spotify"}
                  onClick={() => { setPlayer("spotify"); fetchCurrentlyPlaying(); setPlayerSelectorOpen(false); }}
                >
                  <PlayerDot active={player === "spotify"} />
                  Spotify
                </PlayerSelectorItem>
              )}
              <PlayerSelectorItem
                active={isRockbox}
                onClick={() => {
                  setPlayer("rockbox");
                  setPlayerSelectorOpen(false);
                }}
              >
                <PlayerDot active={isRockbox} />
                This Device
              </PlayerSelectorItem>
              {/* One entry per connected player device. Several can be playing
                  at once — selecting one shows/controls it and makes it the
                  primary (scrobble source), synced across the user's clients. */}
              {Object.values(devices).map((dev) => {
                const isActive = player === "device" && activeDeviceId === dev.deviceId;
                return (
                  <PlayerSelectorItem
                    key={dev.deviceId}
                    active={isActive}
                    onClick={() => {
                      // Devices play independently — switching which one the
                      // miniplayer shows/controls must not pause local playback.
                      selectDevice(dev.deviceId);
                      setPlayerSelectorOpen(false);
                    }}
                  >
                    <PlayerDot active={isActive} />
                    <PlayerSelectorLabel>
                      {dev.name}
                      {dev.nowPlaying?.title ? ` — ${dev.nowPlaying.title}` : ""}
                    </PlayerSelectorLabel>
                  </PlayerSelectorItem>
                );
              })}
            </PlayerSelectorPopup>
          </>,
          // Portal into #root (which carries the `.dark` class) — NOT document.body,
          // which is outside #root and never gets the themed CSS variables.
          document.getElementById("root") ?? document.body,
        );
      })()}

      <StickyPlayer
        nowPlaying={nowPlaying}
        onPlay={onPlay}
        onPause={onPause}
        onPrevious={onPrevious}
        onNext={onNext}
        onSpeaker={() => setPlayerSelectorOpen((o) => !o)}
        speakerRef={speakerRef}
        onPlaylist={() => setQueuePanelOpen((o) => !o)}
        onSeek={onSeek}
        isPlaying={nowPlaying?.isPlaying ?? false}
        onLike={onLike}
        onDislike={onDislike}
        showQueueButton={showQueue}
        queuePanelOpen={queuePanelOpen}
        fullscreenOpen={fullscreenOpen}
        onOpenFullscreen={() => setFullscreenOpen(true)}
        isUploadPlayer={isRockbox}
          showVolume={isRockbox || (player === "device" && deviceVolume !== null)}
          showShuffle={isRockbox || (player === "device" && deviceShuffle !== null)}
          showRepeat={isRockbox || (player === "device" && deviceRepeat !== null)}
        showTrackMenu={showTrackMenu}
        trackQueued={trackQueued}
        shuffle={player === "device" ? (deviceShuffle ?? false) : shuffle}
        repeatMode={player === "device" ? (deviceRepeat ?? "off") : repeatMode}
        onShuffle={onToggleShuffle}
        onRepeat={onCycleRepeat}
        volume={player === "device" ? (deviceVolume ?? volume) : volume}
        muted={muted}
        onVolumeChange={onVolumeChange}
        onToggleMute={onToggleMute}
      />
    </>
  );
}

export default StickyPlayerWithData;
