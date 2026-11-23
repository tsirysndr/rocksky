import { useTerminalDimensions } from "@opentui/react";

/** OpenTUI owns the alternate screen and terminal resize lifecycle. */
export function useFullScreen() {
  const { width, height } = useTerminalDimensions();
  return { cols: width, rows: height };
}
