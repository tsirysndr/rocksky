import { expect, mock, test } from "bun:test";

let casting = false;
let engine = false;
const calls: string[] = [];
mock.module("react-native", () => ({
  Alert: { alert: () => calls.push("alert") },
}));
mock.module("./castPlayback", () => ({
  castPlayback: { connected: () => casting },
}));
mock.module("./uploadEngine", () => ({
  isLocalEngineAvailable: () => engine,
  playUploads: async () => {
    calls.push("play");
    return true;
  },
  queueUploadsNext: async () => {
    calls.push("next");
    return true;
  },
  queueUploadsLast: async () => {
    calls.push("last");
    return true;
  },
}));
const { queueTracks, playQueue } = await import("./libraryPlayback");
const tracks = [
  {
    remoteLibraryId: "server",
    remoteTrackId: "song",
    uploadId: "server:song",
    title: "Song",
    artist: "Artist",
    album: "Album",
    albumArtist: "Artist",
    albumArt: null,
    durationMs: 1234,
    songUri: null,
    albumUri: null,
    artistUri: null,
    sha256: "",
  },
];
test("Chromecast accepts remote queue actions without a local engine", async () => {
  casting = true;
  engine = false;
  calls.length = 0;
  await queueTracks(tracks, "next");
  await queueTracks(tracks, "last");
  await playQueue(tracks, 0);
  expect(calls).toEqual(["next", "last", "play"]);
});
test("disconnected playback still requires a local engine", async () => {
  casting = false;
  engine = false;
  calls.length = 0;
  await queueTracks(tracks, "next");
  expect(calls).toEqual(["alert"]);
  engine = true;
  calls.length = 0;
  await queueTracks(tracks, "last");
  expect(calls).toEqual(["last"]);
});
