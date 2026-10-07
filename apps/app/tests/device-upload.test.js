import { expect, test } from "bun:test";
import {
  localUploadDisabledReason,
  localUploadFiles,
} from "../src/lib/deviceMusicUpload";

const track = {
  id: "1",
  uri: "content://audio/1",
  filename: "song.mp3",
  title: "Été",
  artist: "Artist",
  album: "Summer",
  durationMs: 20000,
};
test("upload requires complete metadata for every album track", () => {
  expect(localUploadDisabledReason([track])).toBeNull();
  for (const field of ["title", "artist", "album"]) {
    const incomplete = { ...track, id: "2", [field]: "" };
    expect(localUploadDisabledReason([track, incomplete])).toContain(
      "incomplete",
    );
    expect(() => localUploadFiles([track, incomplete])).toThrow();
  }
  expect(
    localUploadDisabledReason([{ ...track, artist: "<unknown>" }]),
  ).not.toBeNull();
  expect(
    localUploadDisabledReason([{ ...track, filename: "song.xyz" }]),
  ).not.toBeNull();
  expect(localUploadFiles([track, track])).toEqual([
    {
      uri: track.uri,
      name: track.filename,
      mimeType: "audio/mpeg",
      localTrackId: "1",
    },
  ]);
});
