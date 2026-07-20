import { Box, Text, useInput } from "ink";
import { useAtom, useAtomValue } from "jotai";
import React, { useState } from "react";
import { Cell, Ell } from "./Columns";
import { fmtDuration } from "./format";
import { List } from "./List";
import { playerController } from "./player";
import { playerStatusAtom, queueOpenAtom, queueVersionAtom } from "./store";
import { BLUE, TEAL, VIOLET } from "./theme";

export function QueueView({ height }: { height: number }) {
  const [, setOpen] = useAtom(queueOpenAtom);
  const status = useAtomValue(playerStatusAtom);
  useAtomValue(queueVersionAtom); // re-render on queue changes
  const items = playerController.queueItems;
  const playingIndex = status?.index ?? -1;
  const [selected, setSelected] = useState(
    playingIndex >= 0 ? playingIndex : 0,
  );

  useInput((input, key) => {
    if (key.escape || input === "Q") return setOpen(false);
    if (key.upArrow || input === "k")
      return setSelected((s) => Math.max(0, s - 1));
    if (key.downArrow || input === "j")
      return setSelected((s) => Math.min(items.length - 1, s + 1));
    if (input === "d" || key.delete || key.backspace) {
      playerController.removeAt(selected);
      // Clamp selection to the shortened queue (also forces a re-render).
      setSelected((s) => Math.max(0, Math.min(s, items.length - 2)));
      return;
    }
    if (key.return) {
      playerController.skipTo(selected);
      setOpen(false);
    }
  });

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box>
        <Text bold color={BLUE}>
          {" Current Queue "}
        </Text>
        <Text dimColor>{`  ${items.length} track${items.length === 1 ? "" : "s"} · Enter jump · d remove · Esc close`}</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <List
          items={items}
          selected={selected}
          height={height}
          emptyText="The queue is empty — play something first."
          renderItem={(t, idx, active) => {
            const isPlaying = idx === playingIndex;
            return (
              <>
                <Cell width={2}>
                  <Text color={isPlaying ? TEAL : VIOLET}>
                    {isPlaying ? "♪" : active ? "›" : " "}
                  </Text>
                </Cell>
                <Cell grow>
                  <Ell color={active ? BLUE : undefined} bold={active || isPlaying}>
                    {t.title}
                  </Ell>
                </Cell>
                <Cell width={24}>
                  <Ell dimColor>{t.artist}</Ell>
                </Cell>
                <Cell width={6} right>
                  <Ell color={TEAL}>
                    {t.duration ? fmtDuration(t.duration) : ""}
                  </Ell>
                </Cell>
              </>
            );
          }}
        />
      </Box>
    </Box>
  );
}
