import { loadToken } from "../lib/token.js";
import { startMpdServer } from "../mpd/server.js";
import { playerController } from "../tui/player.js";
import { startHeadlessRuntime } from "../tui/runtime.js";
import { loadSettings } from "../tui/settings.js";
async function mpd(opts) {
  const settings = loadSettings();
  const port = opts.port ? parseInt(opts.port, 10) : settings.mpd.port;
  const bind = opts.bind ?? settings.mpd.bind;
  const getToken = () => loadToken();
  const runtime = startHeadlessRuntime(getToken, { output: opts.output });
  const server = await startMpdServer({
    getToken,
    port,
    bind,
    log: (msg) => console.log(`[mpd] ${msg}`)
  });
  console.log(`Rocksky MPD server listening on ${bind}:${server.port}`);
  if (!getToken()) {
    console.log(
      "Note: not logged in \u2014 run `rocksky login <handle>` to enable playback."
    );
  }
  const shutdown = () => {
    server.close();
    runtime.stop();
    try {
      playerController.close();
    } catch {
    }
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
export {
  mpd
};
