// Remote control over the WebSocket: a controllable player and a controller.
//   ROCKSKY_TOKEN=<jwt> bun run examples/remote.ts player
//   ROCKSKY_TOKEN=<jwt> bun run examples/remote.ts controller
import { RemoteController, RemotePlayer } from "../src/index.js";

const token = process.env.ROCKSKY_TOKEN;
if (!token) throw new Error("set ROCKSKY_TOKEN to a Rocksky access token");
const role = process.argv[2] ?? "player";

if (role === "controller") {
  const controller = new RemoteController({ token, name: "TS Example Controller" });
  controller
    .on("devices", ({ primaryDevice, devices }) => {
      console.log(`devices: ${devices.length} (primary ${primaryDevice ?? "none"})`);
      for (const d of devices) {
        const np = d.nowPlaying ? `${d.nowPlaying.artist} — ${d.nowPlaying.title}` : "(idle)";
        console.log(`  · ${d.name} [${d.deviceId}] ${np}`);
      }
      // Make the first device primary and pause it, as a demo.
      if (devices[0]) {
        controller.setPrimary(devices[0].deviceId);
        controller.pause(devices[0].deviceId);
      }
    })
    .on("nowPlaying", ({ deviceName, track }) =>
      console.log(`♪ ${deviceName}: ${track.artist} — ${track.title}`),
    )
    .on("status", ({ deviceName, status }) => console.log(`● ${deviceName}: ${status}`))
    .on("primaryChanged", ({ deviceId }) => console.log(`★ primary → ${deviceId}`));
  controller.connect();
  console.log("controller connected — listening (Ctrl-C to quit)…");
} else {
  const player = new RemotePlayer({ token, name: "TS Example Player" });
  player
    .on("play", () => console.log("▶ play"))
    .on("pause", () => console.log("⏸ pause"))
    .on("next", () => console.log("⏭ next"))
    .on("previous", () => console.log("⏮ previous"))
    .on("seek", (ms) => console.log(`⏩ seek ${ms}ms`))
    .on("enqueue", (cmd) => console.log(`+ enqueue ${cmd.tracks.length} track(s) (${cmd.mode})`));
  player.connect();

  player.setNowPlaying({
    title: "Chaser",
    artist: "Calibro 35",
    album: "Jazzploitation",
    durationMs: 182320,
    isPlaying: true,
  });
  player.setStatus("playing");
  console.log("player connected — waiting for commands (Ctrl-C to quit)…");
}
