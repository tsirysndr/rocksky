import { afterAll, expect, mock, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import React from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { testRender } from "@opentui/react/test-utils";

const home = await mkdtemp(path.join(os.tmpdir(), "rocksky-opentui-"));
const originalHome = os.homedir;
const originalFetch = globalThis.fetch;
os.homedir = () => home;
const fixtures = Array.from({ length: 40 }, (_, i) => ({
  id: String(i),
  user: "listener",
  title: `Track ${String(i + 1).padStart(2, "0")} · 東京`,
  artist: "Artist with a long name",
  date: new Date().toISOString(),
}));
globalThis.fetch = async () =>
  Response.json({ scrobbles: fixtures, tracks: [], albums: [], artists: [] });
mock.module("../src/tui/nfc.ts", () => ({
  startNfcWatch: () => () => {},
  closeNfc() {},
  writeAlbumTag: async () => {},
  writePlaylistTag: async () => {},
  writeFavoritesTag: async () => {},
}));
mock.module("../src/tui/mpris.ts", () => ({ initMpris: async () => null }));
const { App } = await import("../src/tui/App");
const { queryClient } = await import("../src/tui/queryClient");
const { getDefaultStore } = await import("jotai");
const state = await import("../src/tui/store");
const { normalizeKey } = await import("../src/tui/ui");
const { KeyEvent } = await import("@opentui/core");

function reset() {
  const store = getDefaultStore();
  store.set(state.tabAtom, 0);
  for (const atom of [
    state.authOpenAtom,
    state.searchOpenAtom,
    state.queueOpenAtom,
    state.helpOpenAtom,
    state.soundOpenAtom,
    state.cacheOpenAtom,
  ])
    store.set(atom, false);
  store.set(state.addToPlaylistAtom, null);
  queryClient.clear();
}

test("OpenTUI renders the redesigned shell and supports navigation, dialogs, input and resize", async () => {
  reset();
  queryClient.setQueryData(["globalScrobbles"], {
    pages: [fixtures],
    pageParams: [0],
  });
  const ui = await testRender(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
    { width: 120, height: 38 },
  );
  const press = async (fn: () => void) => {
    await React.act(async () => {
      fn();
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    await ui.flush();
  };
  try {
    await ui.waitForFrame((frame) => frame.includes("Track 01"));
    let frame = ui.captureCharFrame();
    expect(frame).toContain("rocksky");
    expect(frame).not.toMatch(/[╭╮╰╯┌┐└┘│]/);
    expect(frame).toContain("YOUR SPACE");
    expect(frame).toContain("Global Scrobbles");
    expect(frame).toContain("Ready when you are");
    await writeFile(path.join(os.tmpdir(), "rocksky-opentui-wide.txt"), frame);
    await press(() => ui.mockInput.pressKey("e"));
    for (const label of ["32", "64"]) {
      const frequency = ui
        .captureSpans()
        .lines.flatMap((line) => line.spans)
        .find((span) => span.text.trim() === label);
      expect(frequency).toBeDefined();
      expect(frequency!.fg.toInts().slice(0, 3)).toEqual([16, 17, 22]);
      expect(frequency!.bg.toInts().slice(0, 3)).toEqual([184, 161, 255]);
      if (label === "32") await press(() => ui.mockInput.pressArrow("right"));
    }
    await press(() => ui.mockInput.pressEscape());
    await press(() => {
      for (let i = 0; i < 22; i++) ui.mockInput.pressArrow("down");
    });
    await ui.flush();
    expect(ui.captureCharFrame()).toContain("Track 23");
    await press(() => ui.mockInput.pressKey("?"));
    await ui.waitForFrame((frame) => frame.includes("Keyboard Shortcuts"));
    await press(() => ui.mockInput.pressKey("END"));
    expect(ui.captureCharFrame()).toContain("Esc or ? to close");
    await press(() => ui.mockInput.pressEscape());
    await ui.flush();
    expect(getDefaultStore().get(state.helpOpenAtom)).toBe(false);
    await press(() => ui.mockInput.pressKey("A"));
    await ui.waitForFrame((frame) => frame.includes("handle"));
    await React.act(async () => {
      await ui.mockInput.typeText("test.user");
    });
    await ui.flush();
    expect(ui.captureCharFrame()).toContain("test.user");
    await press(() => ui.mockInput.pressBackspace());
    await ui.flush();
    expect(ui.captureCharFrame()).toContain("test.use");
    await press(() => ui.mockInput.pressEscape());
    await ui.flush();
    await press(() => ui.mockInput.pressKey("2"));
    await ui.flush();
    expect(getDefaultStore().get(state.tabAtom)).toBe(1);
    await press(() => ui.mockInput.pressTab({ shift: true }));
    await ui.flush();
    expect(getDefaultStore().get(state.tabAtom)).toBe(0);
    await press(() => ui.resize(80, 26));
    await ui.flush();
    frame = ui.captureCharFrame();
    expect(frame).toContain("My Music");
    const selectedTab = ui
      .captureSpans()
      .lines.flatMap((line) => line.spans)
      .find((span) => span.text.includes("1 Global Scrobbles"));
    expect(selectedTab).toBeDefined();
    expect(selectedTab!.fg.toInts().slice(0, 3)).toEqual([16, 17, 22]);
    expect(selectedTab!.bg.toInts().slice(0, 3)).toEqual([184, 161, 255]);
    expect(frame).toContain("Ready when you are");
    await writeFile(
      path.join(os.tmpdir(), "rocksky-opentui-compact.txt"),
      frame,
    );
    await press(() => ui.resize(60, 18));
    expect(ui.captureCharFrame()).toContain("Ready when you are");
    await press(() => ui.resize(120, 38));
    await press(() =>
      getDefaultStore().set(state.playerStatusAtom as any, {
        state: "playing",
        index: 2,
        queue_len: 8,
        position_ms: 62000,
        duration_ms: 240000,
        metadata: {
          title: "Midnight City",
          artist: "M83",
          codec: "flac",
          sample_rate: 44100,
        },
        shuffle: true,
        repeat: "all",
      }),
    );
    expect(ui.captureCharFrame()).toContain("Midnight City");
    expect(ui.captureCharFrame()).toContain("1:02 / 4:00");
    await writeFile(
      path.join(os.tmpdir(), "rocksky-opentui-playing.txt"),
      ui.captureCharFrame(),
    );
    await press(() => ui.resize(48, 14));
    await ui.flush();
    expect(ui.captureCharFrame()).toContain("Resize to at least");
  } finally {
    await React.act(async () => {
      await ui.dispose();
    });
    queryClient.clear();
  }
});

test("key normalization preserves uppercase shortcuts and isolates navigation from text entry", () => {
  const event = (name: string, sequence: string, extra = {}) =>
    new KeyEvent({
      name,
      sequence,
      raw: sequence,
      ctrl: false,
      meta: false,
      shift: false,
      option: false,
      eventType: "press",
      source: "raw",
      ...extra,
    } as any);
  expect(normalizeKey(event("q", "Q", { shift: true }))[0]).toBe("Q");
  expect(normalizeKey(event("up", "\x1b[A"))[0]).toBe("");
  expect(normalizeKey(event("up", "\x1b[A"))[1].upArrow).toBe(true);
  expect(normalizeKey(event("c", "\x03", { ctrl: true }))[0]).toBe("c");
});

afterAll(async () => {
  os.homedir = originalHome;
  globalThis.fetch = originalFetch;
  await rm(home, { recursive: true, force: true });
});
