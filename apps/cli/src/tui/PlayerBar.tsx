import { Box, Text } from "ink";
import { useAtomValue } from "jotai";
import React from "react";
import { fmtDuration } from "./format";
import { likedUrisAtom } from "./likes";
import { playerController } from "./player";
import { playerStatusAtom, scrobbledTitleAtom } from "./store";
import { BLUE, TEAL, VIOLET } from "./theme";

const BAR_WIDTH = 30;

export function PlayerBar() {
  const status = useAtomValue(playerStatusAtom);
  const scrobbledTitle = useAtomValue(scrobbledTitleAtom);
  const likedUris = useAtomValue(likedUrisAtom);

  if (!status || status.state === "stopped") {
    const restored = playerController.restored;
    if (restored) {
      const track = restored.items[restored.index];
      return (
        <Box borderStyle="round" borderColor={BLUE} paddingX={1}>
          <Text>
            <Text color={BLUE}>⏸ Resume </Text>
            <Text bold>{track?.title ?? "last session"}</Text>
            {track?.artist ? <Text dimColor>{` — ${track.artist}`}</Text> : null}
            <Text dimColor>{`  at ${fmtDuration(restored.positionMs)} — press Space`}</Text>
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

  const filled = dur > 0 ? Math.round((pos / dur) * BAR_WIDTH) : 0;
  const bar =
    "█".repeat(Math.min(filled, BAR_WIDTH)) +
    "─".repeat(Math.max(0, BAR_WIDTH - filled));
  const icon = status.state === "playing" ? "▶" : "⏸";
  const vol = Math.round(playerController.volume() * 100);
  const scrobbled = scrobbledTitle !== "" && scrobbledTitle === title;
  const modes = [
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
        <Text color={BLUE}>{icon} </Text>
        {item?.uri && likedUris.has(item.uri) ? (
          <Text color="#FF3366">{"♥ "}</Text>
        ) : null}
        <Text bold color="white">
          {title}
        </Text>
        {artist ? <Text dimColor>{` — ${artist}`}</Text> : null}
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
