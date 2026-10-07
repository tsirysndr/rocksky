import { expect, test } from "bun:test";
import { searchDeviceTracks } from "../src/lib/deviceMusicSearch";

const track = {
  id: "1",
  uri: "content://audio/1",
  filename: "song.mp3",
  title: "Été",
  artist: "Artist",
  album: "Summer",
  durationMs: 20000,
};
test("local search matches titles, albums, artists and filenames without accents", () => {
  for (const query of ["ete", "SUMMER artist", "song.mp3"])
    expect(searchDeviceTracks([track], query)).toEqual([track]);
  expect(searchDeviceTracks([track], "winter")).toEqual([]);
  expect(searchDeviceTracks([track], "  ")).toEqual([]);
  expect(
    searchDeviceTracks(
      [{ ...track, title: "", artist: "", album: "" }],
      "song",
    ),
  ).toHaveLength(1);
});
