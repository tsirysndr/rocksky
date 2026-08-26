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
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "../../lib/tauri";
import { feedGeneratorUriAtom } from "../../atoms/feed";
import {
  RemoteController,
  type RemoteNowPlaying as SdkRemoteNowPlaying,
  type RemoteQueueItem as SdkRemoteQueueItem,
} from "@rocksky/sdk/remote";
import {
  ensureRockboxReady,
  getRockboxPlayer,
  pinQueueIndex,
  publishRepeat,
  publishShuffle,
  registerTracks,
  streamUrlFor,
} from "../../lib/audio/rockbox-engine";
import { ensureStreamToken } from "../../api/uploads";
import { onMediaControl, pushNowPlaying } from "../../lib/native-media";
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
  const progress =
    sameTrack && Math.abs((prev?.progress ?? 0) - incoming) < 2000
      ? (prev?.progress ?? incoming)
      : incoming;
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
      if (!did) return { byHash: new Map<string, string>(), uris: new Set<string>() };
      // Page through the whole loved list — a single capped request silently
      // truncates for anyone with a large library, and a missing entry reads
      // as "not loved".
      const PAGE = 1000;
      const MAX_PAGES = 10;
      const songs: SongViewBasic[] = [];
      for (let page = 0; page < MAX_PAGES; page++) {
        const batch = await rocksky()
          .lovedSongs(did, PAGE, page * PAGE)
          .catch(() => [] as SongViewBasic[]);
        songs.push(...batch);
        if (batch.length < PAGE) break;
      }
      // Index by sha256 AND by at:// uri: a local library file's hash comes
      // from its own tags, which may differ from the catalog record's, so the
      // uri (resolved via matchSong) is the more reliable key.
      const byHash = new Map<string, string>();
      const uris = new Set<string>();
      for (const song of songs) {
        if (song.sha256) byHash.set(song.sha256, song.uri ?? "");
        if (song.uri) uris.add(song.uri);
      }
      return { byHash, uris };
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
  // The desktop app registers ITSELF as a controllable device ("<name>
  // (Desktop)"). Hide that self-entry from the picker/atoms — controlling
  // yourself over the websocket is a loop; local playback is "This Device".
  const { data: selfRemote } = useQuery({
    queryKey: ["remoteSelfDevice"],
    queryFn: () =>
      invoke<{ deviceId: string | null; name: string | null }>("remote_status"),
    enabled: isTauri(),
    // Poll fast until the register ack lands: until we know which device is
    // us, the server's `devices` snapshot can make us adopt OURSELVES as the
    // remote source — which flips the player away from local playback and
    // silently disables scrobbling.
    refetchInterval: (q) => (q.state.data?.deviceId ? 15_000 : 1_000),
  });
  const selfDeviceIdRef = useRef<string | null>(null);
  const selfNameRef = useRef<string | null>(null);
  useEffect(() => {
    const selfId = selfRemote?.deviceId ?? null;
    selfDeviceIdRef.current = selfId;
    selfNameRef.current = selfRemote?.name ?? null;
    if (!selfId) return;
    // Prune an entry that landed before the id was known…
    setDevices((prev) => {
      if (!prev[selfId]) return prev;
      const next = { ...prev };
      delete next[selfId];
      return next;
    });
    // …and undo a self-adoption that already happened: hand playback back to
    // the local engine so the miniplayer, the heart and scrobbling all work.
    if (activeDeviceIdRef.current === selfId) {
      setActiveDeviceId(null);
      if (playerRef.current === "device") {
        setPlayer(getRockboxPlayer().queue.length ? "rockbox" : null);
      }
    }
  }, [selfRemote?.deviceId, selfRemote?.name, setDevices, setActiveDeviceId, setPlayer]);
  /** Is this device us? Matches on the registered id, and (before the ack
   *  arrives) on our registered display name. */
  const isSelfDevice = (id?: string | null, name?: string | null) =>
    (!!id && id === selfDeviceIdRef.current) ||
    (!!name && !!selfNameRef.current && name === selfNameRef.current);
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

  // Publish shuffle/repeat to the engine. No player/ready guard: publish*
  // remembers the value and (re)applies it on the engine's next init, so
  // repeat "all" set before the first play still loops the queue instead of
  // stopping at the end.
  useEffect(() => {
    publishShuffle(shuffle);
  }, [shuffle]);

  useEffect(() => {
    publishRepeat(repeatMode === "one" ? 1 : repeatMode === "all" ? 2 : 0);
  }, [repeatMode]);

  // Progress ticker for Spotify and remote devices — rockbox progress comes
  // from the engine's own `progress` events, so skip it there to avoid double-
  // counting. For a remote device we tick locally between the device's periodic
  // now-playing pushes (which reconcile any drift).
  useEffect(() => {
    const id = window.setInterval(() => {
      setNowPlaying((prev) => {
        if (!prev || !prev.isPlaying) return prev;
        const p = playerRef.current;
        if (p !== "spotify" && p !== "device") return prev;
        if (prev.progress >= prev.duration) {
          if (p === "spotify") setTimeout(fetchCurrentlyPlaying, 2000);
          return prev;
        }
        return { ...prev, progress: prev.progress + 100 };
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
    const dev = (map ?? devicesRef.current)[id];
    // Adopting our own registration would hand local playback to a loopback
    // "remote" device (and stop scrobbling) — never do it.
    if (isSelfDevice(id, dev?.name)) return;
    setActiveDeviceId(id);
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
          if (!d.deviceId || isSelfDevice(d.deviceId, d.name)) continue;
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
        if (!deviceId || isSelfDevice(deviceId, deviceName)) return;
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
        }
      })
      // Transport status for a device.
      .on("status", ({ deviceId, status }) => {
        if (!deviceId || isSelfDevice(deviceId)) return;
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
        if (!deviceId || isSelfDevice(deviceId, deviceName)) return;
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
        // Never adopt ourselves — local playback stays "This Device".
        if (deviceId && !isSelfDevice(deviceId)) adoptDevice(deviceId);
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
      // Load the whole queue, then skip to the target. Cueing one track and
      // inserting the rest around it is faster in theory, but the native
      // engine only keeps its index pinned to the cued track once playback
      // has actually started — the prepend usually lands first, leaving the
      // index (and so the audio + metadata) on the first track. Skipping is
      // deterministic and the engine still opens only the target track.
      p.setQueue(urls, false);
      p.skipTo(target);
      p.play();
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
    // A remote device manages its own volume — don't spin up the local engine.
    if (player === "device") return;
    const p = getRockboxPlayer();
    if (p.ready) p.setVolume(muted ? 0 : v);
  };

  const onToggleMute = () => {
    const nextMuted = !muted;
    setMutedState(nextMuted);
    if (player === "device") return;
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
      if (!prev || (!prev.sha256 && !prev.songUri)) return prev;
      const key = prev.songUri || prev.sha256;
      // A manual heart click on this song wins over the fetched snapshot.
      if (liked[key] !== undefined) return prev;
      const isLoved =
        (!!prev.songUri && lovedByHash.uris.has(prev.songUri)) ||
        (!!prev.sha256 && lovedByHash.byHash.has(prev.sha256));
      const uri =
        prev.songUri || (prev.sha256 ? lovedByHash.byHash.get(prev.sha256) : "") || "";
      if (prev.liked === isLoved && prev.songUri === uri) return prev;
      return { ...prev, liked: isLoved, songUri: uri };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lovedByHash, player, nowPlaying?.sha256, nowPlaying?.songUri]);

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
    const known = np.sha256 ? lovedByHash?.byHash.get(np.sha256) : undefined;
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

  // ── OS media controls ─────────────────────────────────────────────────────
  // The native side owns them (src-tauri/src/media.rs → souvlaki: macOS Now
  // Playing / media keys, Linux MPRIS). The webview deliberately has NO Media
  // Session and NO <audio> element: a media element in the webview registers a
  // second Now Playing session with the OS, which is why macOS listed Rocksky
  // twice in Control Center / notifications. Playback here is Tauri IPC only
  // (rockbox-wasm is aliased to lib/tauri-rockbox), so nothing in the page
  // needs one.

  const activeDevice = activeDeviceId ? devices[activeDeviceId] : undefined;
  // Album for the OS metadata: whatever the track itself carries (Spotify and
  // uploads both fill it), falling back to the current queue entry — the
  // active remote device's when a device is the source, else the local one.
  const album =
    nowPlaying?.album ||
    (player === "device"
      ? (activeDevice?.queue[activeDevice.queueIndex]?.album ?? "")
      : (queue[queueIndex]?.album ?? ""));

  // Belt and braces: tear down anything that could still be holding a webview
  // media session (a stale session surviving a dev hot-reload, or a media
  // element mounted by some other view), so the OS only ever sees the native
  // one.
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    ms.metadata = null;
    ms.playbackState = "none";
    for (const action of [
      "play",
      "pause",
      "stop",
      "previoustrack",
      "nexttrack",
      "seekto",
      "seekbackward",
      "seekforward",
    ] as const) {
      try {
        ms.setActionHandler(action, null);
      } catch {
        // action unsupported by this webview — nothing to clear
      }
    }
  }, []);

  // Push exactly what the miniplayer renders. Every source (local engine,
  // remote device, Spotify) lands in `nowPlaying`, so mirroring that atom is
  // what keeps the OS controls in step with the UI — deriving them natively
  // from the local engine (as this used to) leaves them stale the moment
  // something else is the source.
  useEffect(() => {
    pushNowPlaying(
      nowPlaying
        ? {
            title: nowPlaying.title ?? "",
            artist: nowPlaying.artist ?? "",
            album,
            albumArt: nowPlaying.albumArt || null,
            duration: Math.max(0, Math.round(nowPlaying.duration ?? 0)),
            position: Math.max(0, Math.round(nowPlaying.progress ?? 0)),
            isPlaying: !!nowPlaying.isPlaying,
          }
        : null,
    );
  }, [
    nowPlaying,
    nowPlaying?.title,
    nowPlaying?.artist,
    nowPlaying?.albumArt,
    nowPlaying?.duration,
    nowPlaying?.progress,
    nowPlaying?.isPlaying,
    album,
  ]);

  // Clear the OS controls when the player goes away, so nothing lingers in
  // Control Center after a quit or a reload.
  useEffect(() => () => pushNowPlaying(null), []);

  // OS transport actions (media keys, Control Center, MPRIS) run through the
  // same handlers as the miniplayer's own buttons, so they always drive
  // whichever backend is currently the source. `transportRef` (the keyboard
  // bridge above) keeps the listener from capturing the handlers — and the
  // `player` they close over — at mount.
  useEffect(
    () =>
      onMediaControl(({ action, position }) => {
        const transport = transportRef.current;
        const np = nowPlayingRef.current;
        switch (action) {
          case "play":
            transport.onPlay();
            break;
          case "pause":
          // The OS "stop" button is a pause here: there is no stopped state in
          // the miniplayer to fall back to.
          case "stop":
            transport.onPause();
            break;
          case "toggle":
            if (np?.isPlaying) transport.onPause();
            else transport.onPlay();
            break;
          case "next":
            transport.onNext();
            break;
          case "previous":
            transport.onPrevious();
            break;
          case "seek":
            if (position != null) transport.onSeek(Math.max(0, position));
            break;
          case "seekBy": {
            if (position == null) break;
            const target = (np?.progress ?? 0) + position;
            const max = np?.duration ?? 0;
            transport.onSeek(Math.min(Math.max(0, target), max || target));
            break;
          }
        }
      }),
    [],
  );

  // Playback ending unmounts the overlay but leaves the atom set, so the next
  // track would open fullscreen on its own.
  useEffect(() => {
    if (!nowPlaying) setFullscreenOpen(false);
  }, [nowPlaying, setFullscreenOpen]);

  if (!nowPlaying) return <></>;

  const isRockbox = player === "rockbox";
  // Show the queue button for the local engine OR a remote device with a queue.
  const showQueue = isRockbox || (player === "device" && !!activeDevice?.queue.length);

  return (
    <>
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
            onReorder={(newQueue) => {
              // Optimistic UI only — the wasm engine has no atomic "move", so
              // the next `queue` event will snap back to the engine's order.
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
            onReorder={() => {
              // No remote reorder — the device re-pushes its queue, which snaps
              // any optimistic change back to the device's real order.
            }}
          />
        </>
      )}

      {fullscreenOpen && (
        <FullscreenPlayer
          nowPlaying={nowPlaying}
          onPlay={onPlay}
          onPause={onPause}
          onPrevious={onPrevious}
          onNext={onNext}
          onSpeaker={() => setPlayerSelectorOpen((o) => !o)}
          speakerRef={fullscreenSpeakerRef}
          onSeek={onSeek}
          isPlaying={nowPlaying.isPlaying}
          onLike={onLike}
          onDislike={onDislike}
          showQueueButton={showQueue}
          queuePanelOpen={queuePanelOpen}
          onPlaylist={() => setQueuePanelOpen((o) => !o)}
          onClose={() => setFullscreenOpen(false)}
          isUploadPlayer={isRockbox}
          volume={volume}
          muted={muted}
          onVolumeChange={onVolumeChange}
          onToggleMute={onToggleMute}
          shuffle={shuffle}
          repeatMode={repeatMode}
          onShuffle={() => setShuffle((s) => !s)}
          onRepeat={() => setRepeatMode((r: RepeatMode) => r === "off" ? "all" : r === "all" ? "one" : "off")}
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
        isPlaying={nowPlaying.isPlaying}
        onLike={onLike}
        onDislike={onDislike}
        showQueueButton={showQueue}
        queuePanelOpen={queuePanelOpen}
        fullscreenOpen={fullscreenOpen}
        onOpenFullscreen={() => setFullscreenOpen(true)}
        isUploadPlayer={isRockbox}
        shuffle={shuffle}
        repeatMode={repeatMode}
        onShuffle={() => setShuffle((s) => !s)}
        onRepeat={() => setRepeatMode((r: RepeatMode) => r === "off" ? "all" : r === "all" ? "one" : "off")}
        volume={volume}
        muted={muted}
        onVolumeChange={onVolumeChange}
        onToggleMute={onToggleMute}
      />
    </>
  );
}

export default StickyPlayerWithData;
