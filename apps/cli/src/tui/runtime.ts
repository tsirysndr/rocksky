// Headless player runtime: the non-UI wiring from the TUI (settings, session
// restore/persist, scrobble + prefetch ticks) factored out so the `rocksky mpd`
// daemon can drive the same playerController without rendering Ink.

import { prefetchTick } from "./playback";
import { playerController } from "./player";
import { startRockskyRemote } from "./rockskyWs";
import { scrobblerTick } from "./scrobbler";
import { loadSession, saveSession } from "./session";
import { loadSettings, saveSettings } from "./settings";

export interface HeadlessRuntime {
  stop(): void;
}

/**
 * Apply persisted settings, restore the last session, and start the background
 * ticks (scrobble threshold + next-track prefetch, queue/position persistence).
 * `getToken` is read on each tick so a login mid-session takes effect.
 */
export function startHeadlessRuntime(
  getToken: () => string | undefined,
  opts: { output?: string } = {},
): HeadlessRuntime {
  // A `--output` flag overrides the persisted audio backend for this run
  // without being written back to settings.toml.
  const settings = loadSettings();
  if (opts.output) settings.output = opts.output;
  playerController.applySettings(settings);

  let saveTimer: NodeJS.Timeout | undefined;
  playerController.onSettingsChange = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(
      () => saveSettings(playerController.snapshotSettings()),
      400,
    );
  };

  const session = loadSession();
  if (session) {
    playerController.restoreSession({
      items: session.queue,
      index: session.index,
      positionMs: session.positionMs,
    });
  }

  const sessionSaver = setInterval(
    () => saveSession(playerController.sessionSnapshot()),
    5000,
  );
  const ticker = setInterval(() => {
    const token = getToken();
    scrobblerTick(token);
    prefetchTick(token);
  }, 2000);

  // Expose the player to the web/mobile miniplayers as a controllable device,
  // and mirror its now-playing there in real time.
  const remote = startRockskyRemote(getToken);

  return {
    stop() {
      clearInterval(sessionSaver);
      clearInterval(ticker);
      clearTimeout(saveTimer);
      remote.stop();
      playerController.onSettingsChange = null;
      // Flush the latest settings + session on the way out.
      saveSettings(playerController.snapshotSettings());
      saveSession(playerController.sessionSnapshot());
    },
  };
}
