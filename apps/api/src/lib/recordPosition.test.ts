import { expect, it } from "bun:test";
import * as Scrobble from "lexicon/types/app/rocksky/scrobble";
import * as Song from "lexicon/types/app/rocksky/song";
import { recordPosition } from "./recordPosition";

for (const [type, validate] of [
  ["app.rocksky.song", Song.validateRecord],
  ["app.rocksky.scrobble", Scrobble.validateRecord],
] as const) {
  const record = {
    $type: type,
    title: "Mirage",
    artist: "Test artist",
    albumArtist: "Test artist",
    album: "Test album",
    duration: 180000,
    createdAt: "2026-10-15T08:00:00.000Z",
  };

  it(`${type} repairs zero positions rejected by the publication schema`, () => {
    expect(validate({ ...record, trackNumber: 0, discNumber: 0 }).success).toBe(
      false,
    );
    const repaired = {
      ...record,
      trackNumber: recordPosition(0),
      discNumber: recordPosition(0),
    };
    expect(repaired.trackNumber).toBe(1);
    expect(repaired.discNumber).toBe(1);
    expect(validate(repaired).success).toBe(true);
  });

  it(`${type} defaults missing or invalid positions without rounding them`, () => {
    for (const value of [
      undefined,
      null,
      -1,
      1.5,
      NaN,
      Infinity,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      const position = recordPosition(value);
      expect(position).toBe(1);
      expect(
        validate({ ...record, trackNumber: position, discNumber: position })
          .success,
      ).toBe(true);
    }
  });

  it(`${type} preserves valid track and disc numbers`, () => {
    const positions = {
      trackNumber: recordPosition(12),
      discNumber: recordPosition(2),
    };
    expect(positions).toEqual({ trackNumber: 12, discNumber: 2 });
    expect(validate({ ...record, ...positions }).success).toBe(true);
  });
}
