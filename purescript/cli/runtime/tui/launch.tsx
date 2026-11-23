import { QueryClientProvider } from "@tanstack/react-query";
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { palette } from "./theme.js";
import { loadToken } from "../lib/token.js";
import React from "react";
import { App } from "./App.js";
import { closeNfc } from "./nfc.js";
import { playerController } from "./player.js";
import { queryClient } from "./queryClient.js";
import { startRockskyRemote } from "./rockskyWs.js";
import { saveSession } from "./session.js";
import { loadSession } from "./session.js";
import { loadSettings, saveSettings } from "./settings.js";

export async function tui(opts: { output?: string } = {}) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("The Rocksky TUI requires an interactive terminal.");
  }
  const renderer = await createCliRenderer({
    screenMode: "alternate-screen",
    exitOnCtrlC: true,
    useMouse: true,
    backgroundColor: palette.background,
    targetFps: 30,
  });
  let root: ReturnType<typeof createRoot> | undefined;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let remote: ReturnType<typeof startRockskyRemote> | undefined;
  const stop = () => renderer.destroy();
  const closed = new Promise<void>((resolve) =>
    renderer.once("destroy", resolve),
  );
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  try {
    root = createRoot(renderer);
    const settings = loadSettings();
    if (opts.output) settings.output = opts.output;
    playerController.applySettings(settings);
    playerController.onSettingsChange = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(
        () => saveSettings(playerController.snapshotSettings()),
        400,
      );
    };
    const session = loadSession();
    if (session)
      playerController.restoreSession({
        items: session.queue,
        index: session.index,
        positionMs: session.positionMs,
      });
    remote = startRockskyRemote(() => loadToken());
    root.render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>,
    );
    await closed;
  } finally {
    process.off("SIGTERM", stop);
    process.off("SIGINT", stop);
    clearTimeout(saveTimer);
    try {
      remote?.stop();
      closeNfc();
      playerController.onSettingsChange = null;
      saveSettings(playerController.snapshotSettings());
      saveSession(playerController.sessionSnapshot());
    } finally {
      queryClient.clear();
      try {
        root?.unmount();
      } finally {
        renderer.destroy();
        await renderer.closed;
      }
    }
  }
  // Native audio handles can outlive JS cleanup; terminal ownership is already
  // released before this exits the interactive process.
  process.exit(0);
}

// Also usable as a standalone Bun asset by the Node-based command dispatchers.
if ((import.meta as ImportMeta & { main?: boolean }).main) {
  const output = process.argv.indexOf("--output");
  await tui(output >= 0 ? { output: process.argv[output + 1] } : {});
}
