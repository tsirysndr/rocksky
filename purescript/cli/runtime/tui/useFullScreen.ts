import { useStdout } from "ink";
import { useEffect, useState } from "react";

interface Size {
  cols: number;
  rows: number;
}

/**
 * Switches the terminal into the alternate screen buffer for a full-window TUI
 * (restored on exit) and tracks the terminal size, updating on resize.
 */
export function useFullScreen(): Size {
  const { stdout } = useStdout();
  const [size, setSize] = useState<Size>({
    cols: stdout.columns || 80,
    rows: stdout.rows || 24,
  });

  useEffect(() => {
    stdout.write("\x1b[?1049h"); // enter alternate screen
    stdout.write("\x1b[2J\x1b[H"); // clear + home

    const onResize = () =>
      setSize({ cols: stdout.columns || 80, rows: stdout.rows || 24 });
    stdout.on("resize", onResize);

    // NOTE: leaving the alternate screen is done by cmd/tui *after* Ink has
    // fully unmounted, so Ink's final writes don't land on the restored
    // terminal. Only detach the resize listener here.
    return () => {
      stdout.off("resize", onResize);
    };
  }, [stdout]);

  return size;
}
