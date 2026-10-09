import { afterEach, expect, mock, test } from "bun:test";
import { getDefaultStore } from "jotai";
import { activeDeviceIdAtom, selectedSourceAtom } from "../src/atoms/devices";
import {
  nowPlayingAtom,
  playbackLockedUntilAtom,
  playerAtom,
} from "../src/atoms/nowplaying";
mock.module("../src/storage", () => ({ storage: { getToken: () => "test" } }));
mock.module("../src/consts", () => ({ API_URL: "https://example.invalid" }));
const { remoteBridge } = await import("../src/lib/remoteBridge");

const events = new Map();
const reflectPlaying = mock(async () => {});
mock.module("react-native-track-player", () => ({
  default: { addEventListener: (event, handler) => events.set(event, handler) },
  Event: {
    RemotePlay: "play",
    RemotePause: "pause",
    RemoteNext: "next",
    RemotePrevious: "previous",
    RemoteStop: "stop",
  },
}));
mock.module("../src/lib/mediaSession", () => ({ reflectPlaying }));
const { playbackService } = await import("../src/lib/playbackService");

const store = getDefaultStore();
afterEach(() => {
  events.clear();
  reflectPlaying.mockClear();
  store.set(activeDeviceIdAtom, null);
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

test("transport never broadcasts while the remote target is unavailable", () => {
  const command = mock(() => {});
  remoteBridge.setController({ command });
  remoteBridge.setRoute("rockbox", "stale-device");
  store.set(playerAtom, "rockbox");
  store.set(nowPlayingAtom, { title: "Current", isPlaying: true });
  for (const action of ["play", "pause", "next", "previous", "seek"]) {
    expect(remoteBridge.send(action, 1000)).toBe(false);
  }
  expect(remoteBridge.setPlaying(false)).toBe(false);
  expect(store.get(nowPlayingAtom).isPlaying).toBe(true);
  expect(store.get(playbackLockedUntilAtom)).toBe(0);
  expect(command).not.toHaveBeenCalled();
});

test("automatic remote routing reads the current device before the route effect", () => {
  const command = mock(() => {});
  remoteBridge.setController({ command });
  remoteBridge.setRoute("rockbox", "old-device");
  store.set(playerAtom, "rockbox");
  store.set(activeDeviceIdAtom, "current-device");
  expect(remoteBridge.send("pause")).toBe(true);
  expect(command).toHaveBeenCalledWith("pause", "current-device", undefined);
});

test("notification-style play/pause stays explicit and follows device switches", () => {
  const command = mock(() => {});
  remoteBridge.setController({ command });
  store.set(selectedSourceAtom, { kind: "device", id: "speaker-a" });
  store.set(activeDeviceIdAtom, "different-primary");
  store.set(nowPlayingAtom, { title: "Current", isPlaying: false });
  // A stale paused UI must not swallow Pause or accidentally send Play.
  expect(remoteBridge.setPlaying(false)).toBe(true);
  expect(command).toHaveBeenLastCalledWith("pause", "speaker-a", undefined);
  store.set(selectedSourceAtom, { kind: "device", id: "speaker-b" });
  expect(remoteBridge.setPlaying(true)).toBe(true);
  expect(command).toHaveBeenLastCalledWith("play", "speaker-b", undefined);
  expect(remoteBridge.setPlaying(true)).toBe(true);
  expect(command).toHaveBeenLastCalledWith("play", "speaker-b", undefined);
});

test("a missing local handler never falls back to remote broadcast", () => {
  const command = mock(() => {});
  remoteBridge.setController({ command });
  store.set(selectedSourceAtom, { kind: "local" });
  expect(remoteBridge.setPlaying(true)).toBe(false);
  expect(command).not.toHaveBeenCalled();
});

test("actual notification handlers target only the selected remote device", async () => {
  const command = mock(() => {});
  remoteBridge.setController({ command });
  store.set(selectedSourceAtom, { kind: "device", id: "speaker-a" });
  store.set(activeDeviceIdAtom, "other-device");
  await playbackService();
  events.get("pause")();
  expect(command).toHaveBeenLastCalledWith("pause", "speaker-a", undefined);
  store.set(selectedSourceAtom, { kind: "device", id: "speaker-b" });
  for (const event of ["play", "next", "previous", "stop"]) {
    events.get(event)();
    expect(command).toHaveBeenLastCalledWith(
      event === "stop" ? "pause" : event,
      "speaker-b",
      undefined,
    );
  }
  expect(command.mock.calls.every((call) => !!call[1])).toBe(true);
});

test("notification controls with no route do not send or fake playback changes", async () => {
  const command = mock(() => {});
  remoteBridge.setController({ command });
  await playbackService();
  for (const handler of events.values()) handler();
  expect(command).not.toHaveBeenCalled();
  expect(reflectPlaying).not.toHaveBeenCalled();
});

test("notification targets survive the real SDK websocket serialization", async () => {
  const { RemoteController } = await import("../../../sdk/typescript/src/remote-controller.ts");
  const frames = [];
  const controller = new RemoteController({ token: "test", name: "Rocksky Test" });
  controller.ws = { readyState: WebSocket.OPEN, send: (frame) => frames.push(JSON.parse(frame)) };
  remoteBridge.setController(controller);
  await playbackService();
  for (const target of ["speaker-a", "speaker-b"]) {
    store.set(selectedSourceAtom, { kind: "device", id: target });
    events.get("pause")();
    events.get("play")();
    expect(frames.at(-2)).toEqual({ type: "command", action: "pause", token: "test", target });
    expect(frames.at(-1)).toEqual({ type: "command", action: "play", token: "test", target });
  }
  store.set(selectedSourceAtom, { kind: "device", id: "" });
  events.get("pause")();
  expect(frames.length).toBe(4);
});
