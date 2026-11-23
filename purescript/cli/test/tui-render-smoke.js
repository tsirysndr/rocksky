import assert from "node:assert/strict";
import { mock } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import React, { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import { QueryClientProvider } from "@tanstack/react-query";
const directory = await mkdtemp(path.join(os.tmpdir(), "rocksky-cli-opentui-"));
const originalHome = os.homedir;
const originalFetch = globalThis.fetch;
os.homedir = () => directory;
globalThis.fetch = async () =>
  Response.json({ scrobbles: [], tracks: [], artists: [], albums: [] });
mock.module("../runtime/tui/nfc.js", () => ({
  startNfcWatch: () => () => {},
  closeNfc() {},
  writeAlbumTag: async () => {},
  writePlaylistTag: async () => {},
  writeFavoritesTag: async () => {},
}));
mock.module("../runtime/tui/mpris.js", () => ({ initMpris: async () => null }));
const { queryClient } = await import("../runtime/tui/queryClient.js");
const { App } = await import("../runtime/tui/App.js");
const { getDefaultStore } = await import("jotai");
const state = await import("../runtime/tui/store.js");
const fixtures = Array.from({ length: 40 }, (_, i) => ({
  id: String(i),
  user: "listener",
  title: `Track ${String(i + 1).padStart(2, "0")} · 東京`,
  artist: "Artist",
  date: new Date().toISOString(),
}));
queryClient.setQueryData(["globalScrobbles"], {
  pages: [fixtures],
  pageParams: [0],
});
let ui;
try {
  ui = await testRender(
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(App),
    ),
    { width: 120, height: 38 },
  );
  const press = async (fn) => {
    await act(async () => {
      fn();
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    await ui.flush();
  };
  await ui.waitForFrame((frame) => frame.includes("Track 01"));
  const frame = ui.captureCharFrame();
  assert.ok(!/[╭╮╰╯┌┐└┘│]/.test(frame), "The TUI should be borderless");
  for (const label of [
    "rocksky",
    "YOUR SPACE",
    "Global Scrobbles",
    "Ready when you are",
  ])
    assert.ok(frame.includes(label), `Missing ${label}`);
  await press(() => {
    for (let i = 0; i < 22; i++) ui.mockInput.pressArrow("down");
  });
  assert.ok(ui.captureCharFrame().includes("Track 23"));
  await press(() => ui.mockInput.pressKey("e"));
  for (const label of ["32", "64"]) {
    const frequency = ui
      .captureSpans()
      .lines.flatMap((line) => line.spans)
      .find((span) => span.text.trim() === label);
    assert.ok(frequency, `Missing EQ band ${label}`);
    assert.deepEqual(frequency.fg.toInts().slice(0, 3), [16, 17, 22]);
    assert.deepEqual(frequency.bg.toInts().slice(0, 3), [184, 161, 255]);
    if (label === "32") await press(() => ui.mockInput.pressArrow("right"));
  }
  await press(() => ui.mockInput.pressEscape());
  await press(() => ui.mockInput.pressKey("?"));
  assert.ok(ui.captureCharFrame().includes("Keyboard Shortcuts"));
  await press(() => ui.mockInput.pressEscape());
  assert.equal(getDefaultStore().get(state.helpOpenAtom), false);
  await press(() => ui.mockInput.pressKey("A"));
  await act(async () => {
    await ui.mockInput.typeText("test.user");
  });
  await ui.flush();
  assert.ok(ui.captureCharFrame().includes("test.user"));
  await press(() => ui.mockInput.pressEscape());
  await press(() => ui.mockInput.pressKey("2"));
  assert.equal(getDefaultStore().get(state.tabAtom), 1);
  await press(() => ui.mockInput.pressTab({ shift: true }));
  assert.equal(getDefaultStore().get(state.tabAtom), 0);
  await press(() => ui.resize(80, 26));
  assert.ok(ui.captureCharFrame().includes("My Music"));
  assert.ok(ui.captureCharFrame().includes("Ready when you are"));
  await writeFile(
    path.join(os.tmpdir(), "rocksky-purescript-opentui.txt"),
    ui.captureCharFrame(),
  );
  console.log(
    "OpenTUI rendered with the PureScript core: selection, dialogs, text input, reverse tab and resizing passed.",
  );
} finally {
  if (ui)
    await act(async () => {
      await ui.dispose();
    });
  queryClient.clear();
  os.homedir = originalHome;
  globalThis.fetch = originalFetch;
  await rm(directory, { recursive: true, force: true });
}
