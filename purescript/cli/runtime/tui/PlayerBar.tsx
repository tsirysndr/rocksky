import { Box, Text } from "./ui.js";
import { useAtomValue } from "jotai";
import React, { useRef } from "react";
import { fmtDuration } from "./format.js";
import { likedIdsAtom } from "./likes.js";
import { isPrefetching } from "./playback.js";
import { playerController } from "./player.js";
import {
  playerNoticeAtom,
  playerStatusAtom,
  scrobbledTitleAtom,
} from "./store.js";
import { BLUE, LINK as AMBER, TEAL, VIOLET, palette } from "./theme.js";

import { useFullScreen } from "./useFullScreen.js";

export function PlayerBar() {
  const { cols } = useFullScreen();
  const showAudio = cols >= 100;
  const showModes = cols >= 120;
  const BAR_WIDTH = Math.max(
    8,
    Math.min(46, cols - (showModes ? 74 : showAudio ? 54 : 36)),
  );
  const status = useAtomValue(playerStatusAtom);
  const scrobbledTitle = useAtomValue(scrobbledTitleAtom);
  const likedIds = useAtomValue(likedIdsAtom);
  const notice = useAtomValue(playerNoticeAtom);
  // Tracks position between polls to detect a stall (= buffering).
  const progress = useRef({ index: -1, pos: -1, stalls: 0 });

  if (!status || status.state === "stopped") {
    const restored = playerController.restored;
    const track = restored?.items[restored.index];
    return (
      <Box
        backgroundColor={palette.surface}
        paddingX={2}
        flexDirection="column"
        height={2}
      >
        <Text wrap="truncate-end">
          <Text color={TEAL}>{restored ? "Ⅱ  " : "♫  "}</Text>
          <Text bold>{track?.title ?? "Ready when you are"}</Text>
          {track?.artist && <Text dimColor>{`  ·  ${track.artist}`}</Text>}
        </Text>
        <Text color={notice ? AMBER : palette.muted} wrap="truncate-end">
          {notice ||
            (restored
              ? `Space to resume  ·  ${fmtDuration(restored.positionMs) || "0:00"}`
              : "Find something you love in My Music. Press Enter to play.")}
        </Text>
      </Box>
    );
  }

  const item = playerController.currentItem();
  const title = item?.title || status.metadata?.title || "Unknown";
  const artist = item?.artist || status.metadata?.artist || "";
  const pos = status.position_ms || 0;
  const dur = status.duration_ms || item?.duration || 0;

  // Buffering = playing but position hasn't moved (initial stream load or a
  // network stall). Shown so the wait for a large file to start is explained.
  const pr = progress.current;
  if (status.state === "playing") {
    if (pr.index === status.index && pr.pos === pos) pr.stalls += 1;
    else pr.stalls = 0;
    pr.pos = pos;
    pr.index = status.index ?? -1;
  } else {
    pr.stalls = 0;
    pr.pos = pos;
  }
  const buffering = status.state === "playing" && (pos === 0 || pr.stalls >= 1);

  // Audio format info probed by the decoder (e.g. "MP3 · 44.1kHz").
  const codec = status.metadata?.codec;
  const sampleRate = status.metadata?.sample_rate;
  const audioInfo = [
    codec ? codec.toUpperCase() : null,
    sampleRate && sampleRate > 0
      ? `${Number.isInteger(sampleRate / 1000) ? sampleRate / 1000 : (sampleRate / 1000).toFixed(1)}kHz`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const filled =
    dur > 0
      ? Math.max(0, Math.min(BAR_WIDTH, Math.round((pos / dur) * BAR_WIDTH)))
      : 0;
  const bar =
    "━".repeat(Math.min(filled, BAR_WIDTH)) +
    "─".repeat(Math.max(0, BAR_WIDTH - filled));
  const icon = buffering ? "⏳" : status.state === "playing" ? "▶" : "⏸";
  const vol = Math.round(playerController.volume() * 100);
  const scrobbled = scrobbledTitle !== "" && scrobbledTitle === title;
  const modes = [
    isPrefetching() ? "caching next" : null,
    scrobbled ? "scrobbled" : null,
    status.shuffle ? "shuffle" : null,
    status.repeat === "all"
      ? "↻ all"
      : status.repeat === "one"
        ? "↻ one"
        : null,
    playerController.sound.eqEnabled ? "eq" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Box
      backgroundColor={palette.surface}
      height={2}
      paddingX={2}
      flexDirection="column"
    >
      <Text wrap="truncate-end">
        <Text color={buffering ? AMBER : BLUE}>{icon} </Text>
        {item?.trackId && likedIds.has(item.trackId) ? (
          <Text color={TEAL}>{"♥ "}</Text>
        ) : null}
        <Text bold color={palette.text}>
          {title}
        </Text>
        {artist ? <Text dimColor>{` — ${artist}`}</Text> : null}
        {buffering ? <Text color={AMBER}>{"   ⏳ buffering…"}</Text> : null}
      </Text>
      <Box gap={2}>
        <Box flexGrow={1} flexShrink={1} minWidth={8}>
          <Text color={TEAL} wrap="truncate-end">
            {bar}
          </Text>
        </Box>
        <Box width={14}>
          <Text
            dimColor
          >{`${fmtDuration(pos) || "0:00"} / ${fmtDuration(dur) || "–:––"}`}</Text>
        </Box>
        {showAudio && (
          <Box width={16}>
            <Text color={VIOLET} wrap="truncate-end">
              {audioInfo}
            </Text>
          </Box>
        )}
        <Box width={8}>
          <Text dimColor>{`vol ${vol}%`}</Text>
        </Box>
        {showModes && (
          <Box width={18}>
            <Text color={TEAL} wrap="truncate-end">
              {modes ||
                `${status.index != null ? status.index + 1 : "–"} / ${status.queue_len} in queue`}
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
