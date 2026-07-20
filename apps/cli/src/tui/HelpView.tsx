import { Box, Text, useInput } from "ink";
import { useAtom } from "jotai";
import React from "react";
import { BLUE, TEAL, VIOLET } from "./theme";
import { helpOpenAtom } from "./store";

const GROUPS: { title: string; keys: [string, string][] }[] = [
  {
    title: "Navigation",
    keys: [
      ["Tab / 1 2 3", "switch tabs"],
      ["↑ ↓", "move selection"],
      ["Enter", "open / play"],
      ["Esc", "back / close"],
      ["q", "quit"],
    ],
  },
  {
    title: "My Music",
    keys: [
      ["← →", "tracks / albums / artists"],
      ["Enter", "play (queue from here)"],
      ["P", "play only this track"],
      ["a", "play album"],
      ["N / L", "play next / last"],
      ["i", "insert-mode menu"],
    ],
  },
  {
    title: "Profile",
    keys: [
      ["b", "open Bluesky profile"],
      ["d", "open PDSLS repo"],
    ],
  },
  {
    title: "Playback",
    keys: [
      ["Space", "play / pause"],
      ["n / p", "next / previous"],
      ["+ / −", "volume"],
      ["s", "shuffle"],
      ["r / o / 0", "repeat all / one / off"],
    ],
  },
  {
    title: "Panels",
    keys: [
      ["/", "search (Tab toggles corpus)"],
      ["Q", "current queue"],
      ["e", "equalizer & sound"],
      ["C", "track cache"],
      ["A", "sign in / sign out"],
      ["?", "this help"],
    ],
  },
];

export function HelpView() {
  const [, setOpen] = useAtom(helpOpenAtom);

  useInput((input, key) => {
    if (key.escape || input === "?" || input === "q") setOpen(false);
  });

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text bold color={BLUE}>
        {" Keyboard Shortcuts "}
      </Text>
      <Box marginTop={1} flexDirection="row" flexWrap="wrap">
        {GROUPS.map((group) => (
          <Box
            key={group.title}
            flexDirection="column"
            width="50%"
            marginBottom={1}
          >
            <Text bold color={TEAL}>
              {group.title}
            </Text>
            {group.keys.map(([k, desc]) => (
              <Text key={k}>
                <Text color={VIOLET}>{k.padEnd(14)}</Text>
                <Text dimColor>{desc}</Text>
              </Text>
            ))}
          </Box>
        ))}
      </Box>
      <Text dimColor>Esc or ? to close</Text>
    </Box>
  );
}
