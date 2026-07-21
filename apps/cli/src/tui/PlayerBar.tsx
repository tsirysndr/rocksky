import { Box, Text } from "ink";
import { useAtomValue } from "jotai";
import React, { useRef } from "react";
import { fmtDuration } from "./format";
import { likedIdsAtom } from "./likes";
import { isPrefetching } from "./playback";
import { playerController } from "./player";
import { playerNoticeAtom, playerStatusAtom, scrobbledTitleAtom } from "./store";
import { BLUE, TEAL, VIOLET } from "./theme";

const BAR_WIDTH = 30;
const AMBER = "#FFB000";

export function PlayerBar() {
  const status = useAtomValue(playerStatusAtom);
  const scrobbledTitle = useAtomValue(scrobbledTitleAtom);
  const likedIds = useAtomValue(likedIdsAtom);
  const notice = useAtomValue(playerNoticeAtom);
  // Tracks position between polls to detect a stall (= buffering).
  const progress = useRef({ index: -1, pos: -1, stalls: 0 });

  if (!status || status.state === "stopped") {
    const restored = playerController.restored;
    if (restored) {
      const track = restored.items[restored.index];
      return (
        <Box borderStyle="round" borderColor={BLUE} paddingX={1}>
          <Text>
            <Text color={notice ? AMBER : BLUE}>{notice ? "⏳ Resume " : "⏸ Resume "}</Text>
            <Text bold>{track?.title ?? "last session"}</Text>
            {track?.artist ? <Text dimColor>{` — ${track.artist}`}</Text> : null}
            {notice ? (
              <Text color={AMBER}>{`   ${notice}`}</Text>
            ) : (
              <Text dimColor>{`  at ${fmtDuration(restored.positionMs)} — press Space`}</Text>
            )}
          </Text>
        </Box>
      );
    }
    return (
      <Box borderStyle="round" borderColor={VIOLET} paddingX={1}>
        <Text dimColor>
          Nothing playing — pick a track in My Music and press Enter.
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
  const buffering =
    status.state === "playing" && (pos === 0 || pr.stalls >= 1);

  const filled = dur > 0 ? Math.round((pos / dur) * BAR_WIDTH) : 0;
  const bar =
    "█".repeat(Math.min(filled, BAR_WIDTH)) +
    "─".repeat(Math.max(0, BAR_WIDTH - filled));
  const icon = buffering ? "⏳" : status.state === "playing" ? "▶" : "⏸";
  const vol = Math.round(playerController.volume() * 100);
  const scrobbled = scrobbledTitle !== "" && scrobbledTitle === title;
  const modes = [
    isPrefetching() ? "caching next" : null,
    scrobbled ? "scrobbled" : null,
    status.shuffle ? "shuffle" : null,
    status.repeat === "all"
      ? "repeat all"
      : status.repeat === "one"
        ? "repeat one"
        : null,
    playerController.sound.eqEnabled ? "eq" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Box
      borderStyle="round"
      borderColor={BLUE}
      paddingX={1}
      flexDirection="column"
    >
      <Text>
        <Text color={buffering ? AMBER : BLUE}>{icon} </Text>
        {item?.trackId && likedIds.has(item.trackId) ? (
          <Text color={TEAL}>{"♥ "}</Text>
        ) : null}
        <Text bold color="white">
          {title}
        </Text>
        {artist ? <Text dimColor>{` — ${artist}`}</Text> : null}
        {buffering ? <Text color={AMBER}>{"   ⏳ buffering…"}</Text> : null}
      </Text>
      <Text>
        <Text color={TEAL}>{bar}</Text>
        <Text dimColor>{`  ${fmtDuration(pos)} / ${fmtDuration(dur)}`}</Text>
        <Text dimColor>{`   vol ${vol}%`}</Text>
        <Text dimColor>{`   [${status.index != null ? status.index + 1 : "-"}/${status.queue_len}]`}</Text>
        {modes ? <Text color={TEAL}>{`   ${modes}`}</Text> : null}
      </Text>
    </Box>
  );
}
