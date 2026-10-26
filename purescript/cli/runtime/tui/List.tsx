import { Box, Text } from "ink";
import React from "react";

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
    return <Text dimColor>{emptyText}</Text>;
  }

  const half = Math.floor(height / 2);
  let start = Math.max(0, selected - half);
  start = Math.min(start, Math.max(0, items.length - height));
  const visible = items.slice(start, start + height);

  return (
    <Box flexDirection="column">
      {visible.map((item, i) => {
        const index = start + i;
        return <Box key={index}>{renderItem(item, index, index === selected)}</Box>;
      })}
    </Box>
  );
}
