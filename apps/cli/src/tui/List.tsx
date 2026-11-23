import { Box, Text } from "./ui";
import React from "react";
import { palette } from "./theme";

interface ListProps<T> {
  items: T[];
  selected: number;
  renderItem: (item: T, index: number, active: boolean) => React.ReactNode;
  height?: number;
  emptyText?: string;
}

/**
 * A vertically-windowed list: keeps the selected row in view and renders at
 * most `height` rows so long libraries don't overflow the terminal.
 */
export function List<T>({
  items,
  selected,
  renderItem,
  height = 15,
  emptyText = "Nothing here.",
}: ListProps<T>) {
  if (items.length === 0) {
    return (
      <Box padding={2} flexDirection="column">
        <Text color={palette.muted}>Your next discovery is waiting.</Text>
        <Text dimColor>{emptyText}</Text>
      </Box>
    );
  }

  const half = Math.floor(height / 2);
  let start = Math.max(0, selected - half);
  start = Math.min(start, Math.max(0, items.length - height));
  const visible = items.slice(start, start + height);

  return (
    <Box flexDirection="column">
      {visible.map((item, i) => {
        const index = start + i;
        return (
          <Box
            key={index}
            height={1}
            backgroundColor={index === selected ? palette.selected : undefined}
          >
            {renderItem(item, index, index === selected)}
          </Box>
        );
      })}
    </Box>
  );
}
