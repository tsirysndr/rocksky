import Feather from "@expo/vector-icons/Feather";
import MaterialIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Image } from "expo-image";
import { useAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import { TouchableOpacity, View } from "react-native";
import axios from "axios";
import { nowPlayingAtom, playbackLockedUntilAtom, playerAtom, progressAtom } from "../atoms/nowplaying";
import { API_URL } from "../consts";
import { useLikeMutation, useUnlikeMutation } from "../hooks/useLike";
import { storage } from "../storage";
import { colors } from "../theme";
import { Text } from "./Text";

type Props = { onPressTrack?: (uri: string) => void };

export default function MiniPlayer({ onPressTrack }: Props) {
  const [nowPlaying, setNowPlaying] = useAtom(nowPlayingAtom);
  const [progress] = useAtom(progressAtom);
  const [player] = useAtom(playerAtom);
  const [, setLockedUntil] = useAtom(playbackLockedUntilAtom);
  const { mutate: likeTrack } = useLikeMutation();
  const { mutate: unlikeTrack } = useUnlikeMutation();

  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nowPlayingRef = useRef(nowPlaying);
  const lockedUntilRef = useRef(0);

  useEffect(() => {
    nowPlayingRef.current = nowPlaying;
  }, [nowPlaying]);

  // WebSocket for Rockbox status updates + control commands
  useEffect(() => {
    const token = storage.getToken();
    if (!token) return;

    const wsUrl = API_URL.replace("https", "wss").replace("http", "ws");
    const ws = new WebSocket(`${wsUrl}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "register", clientName: "rocksky", token }));
      heartbeatRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "heartbeat", token }));
        }
      }, 3000);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const locked = Date.now() < lockedUntilRef.current;
        if (msg.data?.status === 0) {
          setNowPlaying(null);
        } else if (msg.data?.status === 1 && nowPlayingRef.current && !locked) {
          setNowPlaying((prev) => prev ? { ...prev, isPlaying: true } : null);
        } else if ((msg.data?.status === 2 || msg.data?.status === 3) && nowPlayingRef.current && !locked) {
          setNowPlaying((prev) => prev ? { ...prev, isPlaying: false } : null);
        }
      } catch {}
    };

    ws.onerror = () => {};

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      ws.close();
    };
  }, [setNowPlaying]);

  const sendRockboxCommand = useCallback((action: string) => {
    const token = storage.getToken();
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "command", action, token }));
    }
  }, []);

  const onPlayPause = useCallback(async () => {
    if (!nowPlaying) return;
    const lockUntil = Date.now() + 1500;
    lockedUntilRef.current = lockUntil;
    setLockedUntil(lockUntil);
    setNowPlaying((prev) => prev ? { ...prev, isPlaying: !prev.isPlaying } : null);
    if (player === "rockbox") {
      sendRockboxCommand(nowPlaying.isPlaying ? "pause" : "play");
      return;
    }
    const token = storage.getToken();
    try {
      if (nowPlaying.isPlaying) {
        await axios.put(`${API_URL}/spotify/pause`, {}, { headers: { Authorization: `Bearer ${token}` } });
      } else {
        await axios.put(`${API_URL}/spotify/play`, {}, { headers: { Authorization: `Bearer ${token}` } });
      }
    } catch {
      // revert on failure
      setNowPlaying((prev) => prev ? { ...prev, isPlaying: nowPlaying.isPlaying } : null);
    }
  }, [nowPlaying, player, sendRockboxCommand, setNowPlaying]);

  const onNext = useCallback(async () => {
    if (player === "rockbox") {
      sendRockboxCommand("next");
      return;
    }
    const token = storage.getToken();
    try {
      await axios.post(`${API_URL}/spotify/next`, {}, { headers: { Authorization: `Bearer ${token}` } });
    } catch {}
  }, [player, sendRockboxCommand]);

  const onLike = useCallback(() => {
    if (!nowPlaying?.uri) return;
    setNowPlaying((prev) => prev ? { ...prev, liked: true } : null);
    likeTrack(nowPlaying.uri);
  }, [nowPlaying, setNowPlaying, likeTrack]);

  const onUnlike = useCallback(() => {
    if (!nowPlaying?.uri) return;
    setNowPlaying((prev) => prev ? { ...prev, liked: false } : null);
    unlikeTrack(nowPlaying.uri);
  }, [nowPlaying, setNowPlaying, unlikeTrack]);

  if (!nowPlaying) return null;

  const progressPct = nowPlaying.duration > 0
    ? Math.min(100, (progress / nowPlaying.duration) * 100)
    : 0;

  return (
    <View style={{ backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border }}>
      {/* Progress bar */}
      <View style={{ height: 2, backgroundColor: colors.surface2 }}>
        <View style={{ height: 2, width: `${progressPct}%` as any, backgroundColor: colors.primary }} />
      </View>

      {/* Row */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, gap: 12 }}>
        {/* Album art */}
        <View style={{ width: 44, height: 44, borderRadius: 8, overflow: "hidden", backgroundColor: colors.surface2, flexShrink: 0 }}>
          {nowPlaying.cover ? (
            <Image source={nowPlaying.cover} style={{ width: 44, height: 44 }} contentFit="cover" />
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 20, opacity: 0.2 }}>♪</Text>
            </View>
          )}
        </View>

        {/* Track info */}
        <TouchableOpacity
          style={{ flex: 1 }}
          onPress={() => nowPlaying.uri && onPressTrack?.(nowPlaying.uri)}
          activeOpacity={0.7}
        >
          <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "600", color: colors.text }}>
            {nowPlaying.title}
          </Text>
          <Text numberOfLines={1} style={{ fontSize: 11, color: colors.textMuted }}>
            {nowPlaying.artist}
          </Text>
        </TouchableOpacity>

        {/* Controls */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <TouchableOpacity
            onPress={nowPlaying.liked ? onUnlike : onLike}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialIcons
              name={nowPlaying.liked ? "heart" : "heart-outline"}
              size={22}
              color={nowPlaying.liked ? colors.primary : colors.textMuted}
            />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onPlayPause}
            style={{
              width: 38, height: 38, borderRadius: 19,
              backgroundColor: colors.primary,
              alignItems: "center", justifyContent: "center",
            }}
          >
            <Feather
              name={nowPlaying.isPlaying ? "pause" : "play"}
              size={16}
              color="#fff"
            />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onNext}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Feather name="skip-forward" size={22} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
