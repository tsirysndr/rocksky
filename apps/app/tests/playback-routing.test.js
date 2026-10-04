import { afterEach, expect, mock, test } from "bun:test";
import { getDefaultStore } from "jotai";
import { selectedSourceAtom } from "../src/atoms/devices";
import {
  nowPlayingAtom,
  playbackLockedUntilAtom,
  playerAtom,
} from "../src/atoms/nowplaying";
import { remoteBridge } from "../src/lib/remoteBridge";

const store = getDefaultStore();
afterEach(() => {
  store.set(selectedSourceAtom, null);
  store.set(playerAtom, null);
  store.set(nowPlayingAtom, null);
  store.set(playbackLockedUntilAtom, 0);
  remoteBridge.setLocalHandler(null);
  remoteBridge.setController(null);
  remoteBridge.setRoute(null, null);
});

test("play/pause reaches this device even before the route effect catches up", () => {
  const local = mock(() => {});
  const command = mock(() => {});
  remoteBridge.setLocalHandler(local);
  remoteBridge.setController({ command });
  remoteBridge.setRoute("rockbox", "old-device");
  store.set(selectedSourceAtom, { kind: "local" });
  store.set(playerAtom, "local");
  store.set(nowPlayingAtom, { title: "Current", isPlaying: true });
  remoteBridge.togglePlayPause();
  expect(local.mock.calls[0]).toEqual(["pause", undefined]);
  expect(store.get(nowPlayingAtom).isPlaying).toBe(false);
  remoteBridge.togglePlayPause();
  expect(local.mock.calls[1]).toEqual(["play", undefined]);
  expect(store.get(nowPlayingAtom).isPlaying).toBe(true);
  expect(command).not.toHaveBeenCalled();
});

test("a newly selected remote device overrides the previous local route", () => {
  const local = mock(() => {});
  const command = mock(() => {});
  remoteBridge.setLocalHandler(local);
  remoteBridge.setController({ command });
  remoteBridge.setRoute("local", null);
  store.set(playerAtom, "local");
  store.set(selectedSourceAtom, { kind: "device", id: "chosen-device" });
  remoteBridge.send("pause");
  expect(command).toHaveBeenCalledWith("pause", "chosen-device", undefined);
  expect(local).not.toHaveBeenCalled();
});
