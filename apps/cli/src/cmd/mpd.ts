import { loadToken } from "lib/token";
import { startMpdServer } from "../mpd/server";
import { playerController } from "../tui/player";
import { startHeadlessRuntime } from "../tui/runtime";
import { loadSettings } from "../tui/settings";

/**
 * Start a Music Player Daemon protocol server. External MPD clients (mpc,
 * ncmpcpp, MALP, …) connect over TCP to control playback and browse the
 * library. The daemon owns its own headless player, so it works without the
 * TUI. Port/bind default to `~/.rocksky/settings.toml` `[mpd]`, overridable via
 * flags; a busy port falls back to the next free one.
 */
export async function mpd(opts: { port?: string; bind?: string }) {
  const settings = loadSettings();
  const port = opts.port ? parseInt(opts.port, 10) : settings.mpd.port;
  const bind = opts.bind ?? settings.mpd.bind;
  const getToken = () => loadToken();

  const runtime = startHeadlessRuntime(getToken);
  const server = await startMpdServer({
    getToken,
    port,
    bind,
    log: (msg) => console.log(`[mpd] ${msg}`),
  });

  console.log(`Rocksky MPD server listening on ${bind}:${server.port}`);
  if (!getToken()) {
    console.log(
      "Note: not logged in — run `rocksky login <handle>` to enable playback.",
    );
  }

  const shutdown = () => {
    server.close();
    runtime.stop();
    try {
      playerController.close();
    } catch {
      // ignore audio-teardown errors
    }
    // The native audio engine keeps handles on the event loop; force a clean
    // exit to free the audio device.
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
