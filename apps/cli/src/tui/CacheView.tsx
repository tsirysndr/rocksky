import { Box, Text, useInput } from "ink";
import { useAtom } from "jotai";
import React, { useState } from "react";
import { cacheOpenAtom } from "./store";
import { BLUE, TEAL, VIOLET } from "./theme";
import { cacheDir, cacheStats, clearCache } from "./trackCache";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(1)} ${units[i]}`;
}

export function CacheView() {
  const [, setOpen] = useAtom(cacheOpenAtom);
  const [stats, setStats] = useState(() => cacheStats());
  const [confirming, setConfirming] = useState(false);
  const [cleared, setCleared] = useState(false);

  useInput((input, key) => {
    if (key.escape || input === "C") return setOpen(false);
    if (input === "r") {
      setStats(cacheStats());
      return;
    }
    if (input === "c") {
      if (!confirming) {
        setConfirming(true);
        return;
      }
      clearCache();
      setStats(cacheStats());
      setConfirming(false);
      setCleared(true);
    }
  });

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text bold color={BLUE}>
        {" Track Cache "}
      </Text>

      <Box marginTop={1} flexDirection="column">
        <Text>
          <Text color={VIOLET}>{"Cached tracks".padEnd(16)}</Text>
          <Text bold color={TEAL}>
            {stats.files}
          </Text>
        </Text>
        <Text>
          <Text color={VIOLET}>{"Total size".padEnd(16)}</Text>
          <Text bold color={TEAL}>
            {formatBytes(stats.bytes)}
          </Text>
        </Text>
        <Box marginTop={1}>
          <Text dimColor wrap="truncate-end">{`Location: ${cacheDir()}`}</Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        {confirming ? (
          <Text color="#FF5FAF">
            Press c again to delete all cached tracks · Esc to cancel
          </Text>
        ) : cleared ? (
          <Text color={TEAL}>Cache cleared.</Text>
        ) : (
          <Text dimColor>c clear cache · r refresh · Esc close</Text>
        )}
      </Box>
    </Box>
  );
}
