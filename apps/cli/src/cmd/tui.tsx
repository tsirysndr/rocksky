import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "ink";
import React from "react";
import { App } from "../tui/App";
import { playerController } from "../tui/player";
import { queryClient } from "../tui/queryClient";
import { saveSession } from "../tui/session";
import { loadSession } from "../tui/session";
import { loadSettings, saveSettings } from "../tui/settings";

// Leave the alternate screen buffer and re-show the cursor, restoring whatever
// was on the terminal before the TUI launched.
function restoreTerminal() {
  process.stdout.write("\x1b[?1049l\x1b[?25h");
}

export async function tui() {
  if (!process.stdin.isTTY) {
    console.error("The Rocksky TUI requires an interactive terminal.");
    process.exit(1);
  }

  // Safety net: restore the terminal however the process ends (q, Ctrl-C, crash).
  process.on("exit", restoreTerminal);

  // Restore persisted sound / transport preferences and keep them saved
  // (debounced) whenever they change.
  playerController.applySettings(loadSettings());
  let saveTimer: NodeJS.Timeout;
  playerController.onSettingsChange = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(
      () => saveSettings(playerController.snapshotSettings()),
      400,
    );
  };

  // Restore the last playback session (queue + position) — not auto-played;
  // the user resumes from the player bar.
  const session = loadSession();
  if (session) {
    playerController.restoreSession({
      items: session.queue,
      index: session.index,
      positionMs: session.positionMs,
    });
  }

  const { waitUntilExit } = render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
  await waitUntilExit();

  // Flush pending settings + final session on exit.
  // Ink has fully unmounted here; leave the alternate screen last so the TUI is
  // cleared and the pre-launch terminal is restored without artifacts.
  clearTimeout(saveTimer!);
  saveSettings(playerController.snapshotSettings());
  saveSession(playerController.sessionSnapshot());
  restoreTerminal();

  // The native audio engine keeps handles on the event loop (and its close()
  // can block), so force a clean exit — this also frees the audio device.
  process.exit(0);
}
