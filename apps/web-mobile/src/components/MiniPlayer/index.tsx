import {
  IconHeart,
  IconHeartFilled,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconPlayerSkipForwardFilled,
  IconPlayerSkipBackFilled,
  IconDeviceSpeaker,
  IconMusic,
  IconX,
  IconAdjustmentsHorizontal,
} from "@tabler/icons-react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { InsertMode } from "rockbox-wasm";
import { nowPlayingAtom } from "../../atoms/nowpaying";
import { playerAtom } from "../../atoms/player";
import {
  activeDeviceIdAtom,
  devicesAtom,
  type RemoteDevice,
  type RemoteNowPlaying,
} from "../../atoms/devices";
import { playerScreenOpenAtom } from "../../atoms/playerScreen";
import { queueAtom, queueIndexAtom } from "../../atoms/queue";
import { shuffleAtom, repeatModeAtom, type RepeatMode } from "../../atoms/playback";
import useLike from "../../hooks/useLike";
import useSpotify from "../../hooks/useSpotify";
import { useQueuePersistence } from "../../hooks/useQueuePersistence";
import { useUploadScrobble } from "../../hooks/useUploadScrobble";
import { useRockboxEngine } from "../../hooks/useRockboxEngine";
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
import {
  pauseMediaAnchor,
  playMediaAnchor,
} from "../../lib/audio/media-session-anchor";
import EqualizerSheet from "../EqualizerSheet";
import PlayerScreen from "../PlayerScreen";
import axios from "axios";
import { API_URL } from "../../consts";
import _ from "lodash";

// ---------------------------------------------------------------------------
// Source selector bottom sheet
// ---------------------------------------------------------------------------

function SourceSheet({
  open,
  onClose,
  player,
  devices,
  activeDeviceId,
  queueLength,
  onSelectDevice,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  player: string | null;
  devices: Record<string, RemoteDevice>;
  activeDeviceId: string | null;
  queueLength: number;
  onSelectDevice: (deviceId: string) => void;
  onSelect: (src: "spotify" | "upload") => void;
}) {
  if (!open) return null;
  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        onClick={onClose}
      />
      <div
        className="fixed left-0 right-0 bottom-0 z-50 rounded-t-2xl"
        style={{ backgroundColor: "var(--color-surface)", borderTop: "1px solid var(--color-border)" }}
      >
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: "var(--color-border)" }} />
        </div>
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <p className="m-0 text-sm font-semibold" style={{ color: "var(--color-text)" }}>Select Source</p>
          <button onClick={onClose} className="p-1.5 border-none bg-transparent cursor-pointer rounded-lg" style={{ color: "var(--color-text-muted)" }}>
            <IconX size={18} />
          </button>
        </div>
        {/* One entry per connected player device. Several can play at once —
            selecting one shows/controls it and makes it the primary (scrobble
            source), synced across the user's clients. */}
        {Object.values(devices).map((dev) => (
          <SourceItem
            key={dev.deviceId}
            label={dev.name + (dev.nowPlaying?.title ? ` — ${dev.nowPlaying.title}` : "")}
            active={player === "rockbox" && activeDeviceId === dev.deviceId}
            onClick={() => { onSelectDevice(dev.deviceId); onClose(); }}
          />
        ))}
        {queueLength > 0 && (
          <SourceItem label="My Library" active={player === "upload"} onClick={() => { onSelect("upload"); onClose(); }} />
        )}
        <SourceItem label="Spotify" active={player === "spotify"} onClick={() => { onSelect("spotify"); onClose(); }} />
        <button
          onClick={onClose}
          className="w-full py-4 text-center border-none bg-transparent cursor-pointer text-sm font-semibold"
          style={{ color: "var(--color-text-muted)", borderTop: "1px solid var(--color-border)" }}
        >
          Cancel
        </button>
      </div>
    </>
  );
}

function SourceItem({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-5 py-4 border-none bg-transparent cursor-pointer text-left"
      style={{
        backgroundColor: active ? "color-mix(in srgb, var(--color-primary) 8%, transparent)" : "transparent",
        color: active ? "var(--color-primary)" : "var(--color-text)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <div
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: active ? "var(--color-primary)" : "var(--color-text-muted)" }}
      />
      <span className="text-sm font-semibold">{label}</span>
    </button>
  );
}

// Build the miniplayer's now-playing shape from a device's `track` payload.
// `prev` (the same device's previous state) keeps smooth local progress and only
// snaps on a track change or a large (seek) jump.
function toRemoteNowPlaying(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any,
  liked: Record<string, boolean>,
  prev?: RemoteNowPlaying | null,
): RemoteNowPlaying {
  const title = data.title;
  const artist = data.album_artist || data.artist;
  const incoming = data.elapsed ?? 0;
  const sameTrack = !!prev && prev.title === title && prev.artist === artist;
  const progress =
    sameTrack && Math.abs((prev?.progress ?? 0) - incoming) < 2000
      ? (prev?.progress ?? incoming)
      : incoming;
  const isPlaying =
    typeof data.is_playing === "boolean" ? data.is_playing : (prev?.isPlaying ?? true);
  return {
    title,
    artist,
    artistUri: data.artist_uri ?? "",
    songUri: data.song_uri ?? "",
    albumUri: data.album_uri ?? "",
    duration: data.length,
    progress,
    albumArt: _.get(data, "album_art"),
    isPlaying,
    sha256: data.sha256 ?? "",
    liked:
      liked[data.song_uri] !== undefined ? liked[data.song_uri] : !!data.liked,
  };
}

// ---------------------------------------------------------------------------
// MiniPlayer
// ---------------------------------------------------------------------------

export default function MiniPlayer() {
  useQueuePersistence();
  // Bridge the in-browser rockbox-wasm engine → jotai atoms + push EQ/crossfade.
  useRockboxEngine();
  useUploadScrobble();
  const setPlayerScreenOpen = useSetAtom(playerScreenOpenAtom);

  const [nowPlaying, setNowPlaying] = useAtom(nowPlayingAtom);
  const [player, setPlayer] = useAtom(playerAtom);
  const queue = useAtomValue(queueAtom);
  const [queueIndex, setQueueIndex] = useAtom(queueIndexAtom);
  const { like, unlike } = useLike();
  const { play, pause, next } = useSpotify();
  const socketRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const progressInterval = useRef<number | null>(null);
  const lastFetchedRef = useRef(0);
  const nowPlayingRef = useRef(nowPlaying);
  const playerRef = useRef(player);
  const queueRef = useRef(queue);
  const queueIndexRef = useRef(queueIndex);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const likedRef = useRef(liked);
  // Every connected player device (device_id → state), plus which one is active
  // (= the user's primary). A user can run several players at once; each has its
  // own entry so their states never conflict, and the sheet can switch between
  // them.
  const [devices, setDevices] = useAtom(devicesAtom);
  const [activeDeviceId, setActiveDeviceId] = useAtom(activeDeviceIdAtom);
  const devicesRef = useRef(devices);
  const activeDeviceIdRef = useRef(activeDeviceId);
  const rockboxAvailable = Object.keys(devices).length > 0;
  const [sourceSheetOpen, setSourceSheetOpen] = useState(false);
  const [eqSheetOpen, setEqSheetOpen] = useState(false);
  const [shuffle, setShuffle] = useAtom(shuffleAtom);
  const [repeatMode, setRepeatMode] = useAtom(repeatModeAtom);
  // A hidden silent <audio> (owned by media-session-anchor, not React) plays
  // while the wasm engine plays, so the OS / lock-screen media controls (Media
  // Session) surface — Web Audio alone doesn't trigger them.

  // Keep refs in sync
  useEffect(() => {
    nowPlayingRef.current = nowPlaying;
    playerRef.current = player;
    likedRef.current = liked;
    queueRef.current = queue;
    queueIndexRef.current = queueIndex;
    devicesRef.current = devices;
    activeDeviceIdRef.current = activeDeviceId;
  }, [nowPlaying, player, liked, queue, queueIndex, devices, activeDeviceId]);

  // Publish shuffle/repeat to the engine. No player/ready guard: publish*
  // remembers the value and (re)applies it on the engine's next init, so
  // repeat "all" set before the first play still loops the queue.
  useEffect(() => {
    publishShuffle(shuffle);
  }, [shuffle]);

  useEffect(() => {
    publishRepeat(repeatMode === "one" ? 1 : repeatMode === "all" ? 2 : 0);
  }, [repeatMode]);

  /** Ensure the wasm engine has the current queue loaded, then return it.
   *  Used when (re)activating the upload player — e.g. after a restore or when
   *  switching back to it from Spotify. Idempotent: won't reload if already
   *  holding a queue. */
  const ensureEngineQueue = useCallback(async () => {
    const p = await ensureRockboxReady();
    if (p.queue.length > 0) return { p, loaded: false };
    const q = queueRef.current;
    if (!q.length) return { p, loaded: false };
    await ensureStreamToken();
    registerTracks(q);
    const urls = q.map(streamUrlFor);
    const idx = Math.min(Math.max(0, queueIndexRef.current), urls.length - 1);
    const seekMs = nowPlayingRef.current?.progress ?? 0;
    // Start the saved track immediately, background-fill the rest, then seek to
    // the saved elapsed time once it's decoded (resume after reload).
    p.setQueue([urls[idx]], true);
    const after = urls.slice(idx + 1);
    const before = urls.slice(0, idx);
    if (after.length) p.insert(after, InsertMode.PlayLast);
    if (before.length) p.insert(before, InsertMode.Prepend);
    if (seekMs > 1000) {
      const onceTrack = () => {
        p.off("track", onceTrack);
        try { p.seek(seekMs); } catch { /* not seekable yet */ }
      };
      p.on("track", onceTrack);
    }
    return { p, loaded: true };
  }, []);

  const fetchCurrentlyPlaying = useCallback(async () => {
    if (playerRef.current === "rockbox" || playerRef.current === "upload") return;
    try {
      const { data } = await axios.get(`${API_URL}/spotify/currently-playing`, {
        headers: { authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (playerRef.current !== null && playerRef.current !== "spotify") return;
      if (data.item) {
        setNowPlaying({
          title: data.item.name,
          artist: data.item.artists[0].name,
          artistUri: data.artistUri,
          songUri: data.songUri,
          albumUri: data.albumUri,
          duration: data.item.duration_ms,
          progress: data.progress_ms,
          albumArt: _.get(data, "item.album.images.0.url"),
          isPlaying: data.is_playing,
          sha256: data.sha256,
          liked:
            likedRef.current[data.songUri] !== undefined
              ? likedRef.current[data.songUri]
              : data.liked,
        });
        setPlayer("spotify");
        lastFetchedRef.current = Date.now();
      } else if (playerRef.current === "spotify") {
        setNowPlaying(null);
        setPlayer(null);
      }
    } catch {
      // no spotify session
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setNowPlaying, setPlayer]);

  // Stop wasm playback when switching away from the upload player.
  useEffect(() => {
    if (player === "upload") return;
    const p = getRockboxPlayer();
    if (p.ready) p.pause();
  }, [player]);

  // Progress ticker (Spotify only — upload progress comes from engine events,
  // the WebSocket rockbox device reports its own elapsed).
  useEffect(() => {
    progressInterval.current = window.setInterval(() => {
      setNowPlaying((prev) => {
        if (!prev || !prev.isPlaying) return prev;
        if (playerRef.current === "upload") return prev;
        if (prev.progress >= prev.duration) {
          if (playerRef.current === "spotify") setTimeout(fetchCurrentlyPlaying, 2000);
          return prev;
        }
        return { ...prev, progress: prev.progress + 100 };
      });
    }, 100);
    return () => { if (progressInterval.current) clearInterval(progressInterval.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Spotify polling
  useEffect(() => {
    if (!localStorage.getItem("token")) return;
    fetchCurrentlyPlaying();
    const id = window.setInterval(fetchCurrentlyPlaying, 15000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Transport command → the ACTIVE device only (targeted, so controlling one
  // player never disturbs the others).
  const sendDeviceCommand = useCallback((action: string, args?: unknown) => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
      type: "command",
      action,
      args,
      target: activeDeviceIdRef.current ?? undefined,
      token: localStorage.getItem("token"),
    }));
  }, []);

  // Adopt `id` as the active device (on a server `primary_changed`, keeping every
  // client in sync). Doesn't steal focus from Spotify / the local engine.
  const adoptDevice = useCallback((id: string, map?: Record<string, RemoteDevice>) => {
    setActiveDeviceId(id);
    const dev = (map ?? devicesRef.current)[id];
    if (!dev) return;
    if (playerRef.current === null || playerRef.current === "rockbox") {
      if (dev.nowPlaying) setNowPlaying(dev.nowPlaying);
      setPlayer("rockbox");
    }
  }, [setActiveDeviceId, setNowPlaying, setPlayer]);

  // The user picked a device in the source sheet → show/control it AND make it
  // the primary (scrobble source), synced to the server + the user's other UIs.
  const selectDevice = useCallback((id: string) => {
    setActiveDeviceId(id);
    const dev = devicesRef.current[id];
    if (dev?.nowPlaying) setNowPlaying(dev.nowPlaying);
    setPlayer("rockbox");
    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: "set_primary",
        device_id: id,
        token: localStorage.getItem("token"),
      }));
    }
  }, [setActiveDeviceId, setNowPlaying, setPlayer]);

  // WebSocket relay: lists every connected player device and mirrors the active
  // one into the miniplayer; transport is sent back as targeted commands.
  useEffect(() => {
    if (!localStorage.getItem("token")) return;
    const wsUrl = API_URL.replace("https", "wss").replace("http", "ws");
    const ws = new WebSocket(`${wsUrl}/ws`);
    socketRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: "register",
        clientName: "rocksky",
        token: localStorage.getItem("token"),
      }));

      heartbeatRef.current = window.setInterval(() => {
        ws.send(JSON.stringify({ type: "heartbeat", token: localStorage.getItem("token") }));
      }, 3000);

      ws.onmessage = (event) => {
        if (event.data === "pong") return;
        const msg = JSON.parse(event.data);

        // Snapshot of the players already streaming when we connected.
        if (msg.type === "devices" && Array.isArray(msg.devices)) {
          const map: Record<string, RemoteDevice> = {};
          for (const d of msg.devices) {
            if (!d.device_id) continue;
            const name = d.now_playing?.device_name ?? d.name ?? "Rockbox";
            map[d.device_id] = {
              deviceId: d.device_id,
              name,
              nowPlaying: d.now_playing
                ? toRemoteNowPlaying(d.now_playing, likedRef.current)
                : null,
            };
          }
          setDevices(map);
          if (msg.primary_device && map[msg.primary_device]) adoptDevice(msg.primary_device, map);
          return;
        }

        // A player pushed a track → upsert its entry in the device map.
        if (msg.type === "message" && msg.data?.type === "track") {
          const id = msg.device_id;
          if (!id) return;
          if (!msg.data.title && !msg.data.artist && !msg.data.album_artist) return;
          const name = msg.data?.device_name ?? msg.device_name ?? "Rockbox";
          const prevNp = devicesRef.current[id]?.nowPlaying ?? null;
          const np = toRemoteNowPlaying(msg.data, likedRef.current, prevNp);
          setDevices((prev) => ({ ...prev, [id]: { deviceId: id, name, nowPlaying: np } }));
          // Mirror into the miniplayer when this is the active device. If nothing
          // is playing yet, promote the device source (covers the race where
          // primary_changed arrived before the first track).
          if (
            activeDeviceIdRef.current === id &&
            (playerRef.current === "rockbox" || playerRef.current === null)
          ) {
            setNowPlaying(np);
            if (playerRef.current === null) setPlayer("rockbox");
            lastFetchedRef.current = Date.now();
          }
          return;
        }

        // A device left → drop it; if it was active, clear the miniplayer.
        if (msg.type === "device_unregistered" && msg.device_id) {
          const gone = msg.device_id;
          setDevices((prev) => {
            if (!prev[gone]) return prev;
            const next = { ...prev };
            delete next[gone];
            return next;
          });
          if (activeDeviceIdRef.current === gone) {
            setActiveDeviceId(null);
            if (playerRef.current === "rockbox") { setNowPlaying(null); setPlayer(null); }
          }
          return;
        }

        // The primary device changed (this client, another, or auto-adopt).
        if (msg.type === "primary_changed" && msg.device_id) {
          adoptDevice(msg.device_id);
          return;
        }

        // Transport status for a device: 1 = playing, 0/2/3 = not playing.
        if (msg.data?.type === "status" && msg.device_id) {
          const id = msg.device_id;
          const playing = msg.data.status === 1;
          setDevices((prev) => {
            const dev = prev[id];
            if (!dev?.nowPlaying) return prev;
            return { ...prev, [id]: { ...dev, nowPlaying: { ...dev.nowPlaying, isPlaying: playing } } };
          });
          if (activeDeviceIdRef.current === id && playerRef.current === "rockbox") {
            setNowPlaying((prev) => prev ? { ...prev, isPlaying: playing } : prev);
          }
        }
      };
    };

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      ws.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onLike = () => {
    if (!nowPlaying) return;
    setLiked((prev) => ({ ...prev, [nowPlaying.songUri]: true }));
    like(nowPlaying.songUri);
    setNowPlaying((prev) => prev ? { ...prev, liked: true } : prev);
  };
  const onDislike = () => {
    if (!nowPlaying) return;
    setLiked((prev) => ({ ...prev, [nowPlaying.songUri]: false }));
    unlike(nowPlaying.songUri);
    setNowPlaying((prev) => prev ? { ...prev, liked: false } : prev);
  };

  const onPlayPause = async () => {
    if (!nowPlaying) return;
    // Kick the Media Session anchor synchronously, inside this click, when
    // resuming — an awaited resume would land outside the gesture and be blocked.
    if (player === "upload" && !nowPlaying.isPlaying) playMediaAnchor();
    if (player === "upload") {
      const { p, loaded } = await ensureEngineQueue();
      // If we just (re)loaded the queue it's already playing the saved track —
      // toggling would immediately pause it.
      if (!loaded) p.toggle();
      return;
    }
    if (player === "rockbox") {
      sendDeviceCommand(nowPlaying.isPlaying ? "pause" : "play");
      return;
    }
    nowPlaying.isPlaying ? pause() : play();
  };

  const onNext = () => {
    if (player === "upload") {
      getRockboxPlayer().next();
      return;
    }
    if (player === "rockbox") {
      sendDeviceCommand("next");
      return;
    }
    next();
  };

  const onPrevious = () => {
    if (player === "rockbox") {
      sendDeviceCommand("previous");
      return;
    }
    if (player !== "upload") return;
    getRockboxPlayer().prev();
  };

  const onSeek = useCallback((positionMs: number) => {
    if (playerRef.current === "upload") {
      const p = getRockboxPlayer();
      if (p.ready) p.seek(positionMs);
    } else if (playerRef.current === "rockbox") {
      sendDeviceCommand("seek", { position: positionMs });
    }
    setNowPlaying((prev) => prev ? { ...prev, progress: positionMs } : prev);
  }, [setNowPlaying, sendDeviceCommand]);

  const onSelectQueueIndex = useCallback((idx: number) => {
    const track = queueRef.current[idx];
    if (!track) return;
    // Pin the chosen index so a late status from the outgoing track can't
    // revert the "up next" the user just selected, then jump.
    pinQueueIndex(idx);
    getRockboxPlayer().skipTo(idx);
    // Optimistic now-playing for instant UI; engine track event reconciles.
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
  }, [setQueueIndex, setNowPlaying]);

  const onRemoveFromQueue = useCallback((idx: number) => {
    getRockboxPlayer().removeAt(idx);
  }, []);

  // Media Session API — Android/iOS lock-screen / notification. Mirrors the
  // mini-player: title, artist, album + artwork, live play/pause state, a
  // scrubbable position, and every transport action.
  const msAlbum = queue[queueIndex]?.album;

  useEffect(() => {
    if (!("mediaSession" in navigator) || !nowPlaying) return;
    const art = nowPlaying.albumArt;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: nowPlaying.title,
      artist: nowPlaying.artist,
      album: msAlbum ?? "",
      artwork: art
        ? [
            { src: art, sizes: "96x96" },
            { src: art, sizes: "256x256" },
            { src: art, sizes: "512x512" },
          ]
        : [],
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowPlaying?.title, nowPlaying?.artist, nowPlaying?.albumArt, msAlbum]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const set = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);
    // Drive the silent anchor SYNCHRONOUSLY here (inside the media-key gesture)
    // so resume works — the deferred sync effect can't call play() in-gesture
    // and would be blocked by the autoplay policy. onPlayPause routes to the
    // active backend (wasm engine / Spotify / device).
    set("play", () => {
      playMediaAnchor();
      if (!nowPlayingRef.current?.isPlaying) onPlayPause();
    });
    set("pause", () => {
      pauseMediaAnchor();
      if (nowPlayingRef.current?.isPlaying) onPlayPause();
    });
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

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = nowPlaying?.isPlaying ? "playing" : "paused";
  }, [nowPlaying?.isPlaying]);

  // Keep the silent Media Session anchor in sync with engine playback. The
  // in-gesture start happens in the click handlers (playNow / resume / media
  // keys); this effect only mirrors state afterwards and pauses when idle.
  useEffect(() => {
    if (player === "upload" && nowPlaying?.isPlaying) playMediaAnchor();
    else pauseMediaAnchor();
  }, [player, nowPlaying?.isPlaying]);

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
      // invalid values mid-transition — ignore
    }
  }, [nowPlaying?.progress, nowPlaying?.duration]);

  if (!nowPlaying) return null;

  const progress =
    nowPlaying.duration > 0
      ? (nowPlaying.progress / nowPlaying.duration) * 100
      : 0;

  const songPath = nowPlaying.songUri
    ? `/${nowPlaying.songUri.split("at://")[1]?.replace("app.rocksky.", "")}`
    : null;

  const showSourceBtn = rockboxAvailable || queue.length > 0;

  return (
    <>
      <EqualizerSheet open={eqSheetOpen} onClose={() => setEqSheetOpen(false)} />

      <PlayerScreen
        onSeek={onSeek}
        onPlayPause={onPlayPause}
        onNext={onNext}
        onPrevious={onPrevious}
        onSelectQueueIndex={onSelectQueueIndex}
        onRemoveFromQueue={onRemoveFromQueue}
        onEqualizer={() => setEqSheetOpen(true)}
        queue={queue}
        queueIndex={queueIndex}
        shuffle={shuffle}
        repeatMode={repeatMode}
        onShuffle={() => setShuffle((s) => !s)}
        onRepeat={() => setRepeatMode((r: RepeatMode) => r === "off" ? "all" : r === "all" ? "one" : "off")}
      />

      <SourceSheet
        open={sourceSheetOpen}
        onClose={() => setSourceSheetOpen(false)}
        player={player}
        devices={devices}
        activeDeviceId={activeDeviceId}
        onSelectDevice={(id) => selectDevice(id)}
        queueLength={queue.length}
        onSelect={(src) => {
          if (src === "upload" && player !== "upload") {
            const track = queue[queueIndex];
            if (track) {
              setNowPlaying({
                title: track.title,
                artist: track.artist,
                artistUri: "",
                songUri: track.songUri ?? "",
                albumUri: "",
                duration: track.duration,
                progress: 0,
                albumArt: track.albumArt ?? undefined,
                isPlaying: false,
                sha256: track.sha256,
                liked: false,
              });
            }
            setPlayer(src);
            void ensureEngineQueue();
            return;
          }
          setPlayer(src);
          if (src === "spotify") fetchCurrentlyPlaying();
        }}
      />

      <div
        className="fixed left-0 right-0 z-30"
        style={{
          bottom: `calc(56px + env(safe-area-inset-bottom))`,
          backgroundColor: "var(--color-surface)",
          borderTop: "1px solid var(--color-border)",
          height: "var(--player-height)",
        }}
      >
        {/* Progress bar */}
        <div className="h-0.5 w-full" style={{ backgroundColor: "var(--color-border)" }}>
          <div
            className="h-full transition-all duration-100"
            style={{ width: `${progress}%`, backgroundColor: "var(--color-primary)" }}
          />
        </div>

        <div
          className="flex items-center h-[calc(var(--player-height)-2px)] px-4 gap-3"
          onClick={() => { if (player === "upload") setPlayerScreenOpen(true); }}
          style={{ cursor: player === "upload" ? "pointer" : "default" }}
        >
          {/* Album art */}
          {nowPlaying.albumArt ? (
            <img
              src={nowPlaying.albumArt}
              alt="album"
              className="w-12 h-12 rounded-lg object-cover shrink-0"
            />
          ) : (
            <div
              className="w-12 h-12 rounded-lg shrink-0 flex items-center justify-center"
              style={{ backgroundColor: "var(--color-surface-2)" }}
            >
              <IconMusic size={20} color="var(--color-text-muted)" strokeWidth={1.5} />
            </div>
          )}

          {/* Track info */}
          <div className="flex-1 min-w-0">
            {songPath && player !== "upload" ? (
              <Link
                to={songPath}
                className="block font-semibold text-sm truncate no-underline"
                style={{ color: "var(--color-text)" }}
              >
                {nowPlaying.title}
              </Link>
            ) : (
              <p className="font-semibold text-sm truncate m-0" style={{ color: "var(--color-text)" }}>
                {nowPlaying.title}
              </p>
            )}
            <p className="text-xs truncate m-0" style={{ color: "var(--color-text-muted)" }}>
              {nowPlaying.artist}
            </p>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            {showSourceBtn && (
              <button
                onClick={() => setSourceSheetOpen(true)}
                className="p-1.5 border-none bg-transparent cursor-pointer rounded-lg"
              >
                <IconDeviceSpeaker size={18} color={player !== null ? "var(--color-primary)" : "var(--color-text-muted)"} />
              </button>
            )}
            {player === "upload" && (
              <button
                onClick={() => setEqSheetOpen(true)}
                className="p-1.5 border-none bg-transparent cursor-pointer rounded-lg"
              >
                <IconAdjustmentsHorizontal size={18} color="var(--color-text-muted)" />
              </button>
            )}

            {player === "upload" ? (
              <button
                onClick={onPrevious}
                className="p-1 border-none bg-transparent cursor-pointer"
              >
                <IconPlayerSkipBackFilled size={20} color="var(--color-text-muted)" />
              </button>
            ) : (
              <button
                onClick={nowPlaying.liked ? onDislike : onLike}
                className="p-1 border-none bg-transparent cursor-pointer"
              >
                {nowPlaying.liked ? (
                  <IconHeartFilled size={20} color="var(--color-primary)" />
                ) : (
                  <IconHeart size={20} color="var(--color-text-muted)" />
                )}
              </button>
            )}

            <button
              onClick={onPlayPause}
              className="w-10 h-10 rounded-full flex items-center justify-center border-none cursor-pointer"
              style={{ backgroundColor: "var(--color-primary)" }}
            >
              {nowPlaying.isPlaying ? (
                <IconPlayerPauseFilled size={18} color="#fff" />
              ) : (
                <IconPlayerPlayFilled size={18} color="#fff" />
              )}
            </button>

            <button
              onClick={onNext}
              className="p-1 border-none bg-transparent cursor-pointer"
            >
              <IconPlayerSkipForwardFilled size={20} color="var(--color-text-muted)" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
