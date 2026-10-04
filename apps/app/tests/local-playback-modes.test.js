import { expect, test } from "bun:test";
import {
  createLocalPlaybackModes,
  parsePlaybackModes,
} from "../src/lib/localPlaybackModes";

test("shuffle and every repeat mode survive a fresh player instance", async () => {
  for (const repeat of ["off", "one", "all"]) {
    for (const shuffle of [false, true]) {
      let disk = null;
      const storage = [
        async () => disk,
        async (raw) => {
          disk = raw;
        },
      ];
      const changes = [];
      const player = createLocalPlaybackModes(...storage, (modes) =>
        changes.push(modes),
      );
      await player.set({ shuffle });
      await player.set({ repeat });
      const restarted = createLocalPlaybackModes(...storage, () => {});
      expect(await restarted.load()).toEqual({ shuffle, repeat });
      expect(changes.at(-1)).toEqual({ shuffle, repeat });
    }
  }
});

test("a toggle during startup preserves the other saved setting", async () => {
  let release;
  const loaded = new Promise((resolve) => {
    release = resolve;
  });
  let disk;
  const player = createLocalPlaybackModes(
    () => loaded,
    async (raw) => {
      disk = raw;
    },
    () => {},
  );
  const initial = player.load();
  const changed = player.set({ shuffle: true });
  release(JSON.stringify({ shuffle: false, repeat: "all" }));
  await Promise.all([initial, changed]);
  expect(JSON.parse(disk)).toEqual({ shuffle: true, repeat: "all" });
});

test("older slow writes cannot overwrite the last repeat/shuffle choice", async () => {
  let disk;
  let unblock;
  const blocked = new Promise((resolve) => {
    unblock = resolve;
  });
  let writes = 0;
  const player = createLocalPlaybackModes(
    async () => null,
    async (raw) => {
      if (++writes === 1) await blocked;
      disk = raw;
    },
    () => {},
  );
  const first = player.set({ repeat: "one" });
  const second = player.set({ repeat: "all", shuffle: true });
  unblock();
  await Promise.all([first, second]);
  expect(JSON.parse(disk)).toEqual({ shuffle: true, repeat: "all" });
});

test("missing or invalid preferences safely use defaults", () => {
  for (const raw of [
    null,
    "invalid",
    "null",
    "{}",
    '{"shuffle":"yes","repeat":"bad"}',
  ]) {
    expect(parsePlaybackModes(raw)).toEqual({ shuffle: false, repeat: "off" });
  }
});
