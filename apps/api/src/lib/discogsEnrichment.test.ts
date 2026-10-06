import { describe, expect, it } from "bun:test";
import type { DiscogsEnrichResponse, DiscogsEnrichedTrack } from "./discogs";
import {
  MISS_RETRY_MS,
  discogsSearchKey,
  isStaleSearch,
  matchScore,
  toDiscogsReleaseRow,
} from "./discogsEnrichment";

const NOW = 1_700_000_000_000;

const track: DiscogsEnrichedTrack = {
  title: "",
  artist: "Daft Punk",
  albumArtist: "Daft Punk",
  album: "Random Access Memories",
  albumArt: "https://i.discogs.com/primary.jpeg",
  year: 2021,
  originalYear: 2013,
  releaseDate: "2021-02-19",
  country: "Europe",
  label: "Columbia",
  catalogNumber: "88883716861",
  barcode: "888837168618",
  formats: ["Vinyl, LP, Album, Reissue"],
  genres: ["Electronic"],
  styles: ["Disco", "Synth-pop"],
  discogsUrl: "https://www.discogs.com/release/4570366",
  discogsReleaseId: 4570366,
  discogsMasterId: 525058,
  discogsArtistId: 1289,
};

describe("discogsSearchKey", () => {
  it("ignores case and surrounding whitespace", () => {
    expect(discogsSearchKey("  Daft Punk ", "Random Access Memories")).toBe(
      discogsSearchKey("daft punk", "random access memories"),
    );
  });

  it("separates different albums by the same artist", () => {
    expect(discogsSearchKey("Daft Punk", "Discovery")).not.toBe(
      discogsSearchKey("Daft Punk", "Homework"),
    );
  });
});

describe("isStaleSearch", () => {
  it("never re-asks about a match", () => {
    expect(
      isStaleSearch({ releaseId: "rel_1", searchedAt: new Date(0) }, NOW),
    ).toBe(false);
  });

  it("holds a fresh miss", () => {
    expect(
      isStaleSearch({ releaseId: null, searchedAt: new Date(NOW - 1000) }, NOW),
    ).toBe(false);
  });

  it("re-asks about a miss once it ages out", () => {
    expect(
      isStaleSearch(
        { releaseId: null, searchedAt: new Date(NOW - MISS_RETRY_MS - 1) },
        NOW,
      ),
    ).toBe(true);
  });
});

describe("toDiscogsReleaseRow", () => {
  it("maps every release field", () => {
    const row = toDiscogsReleaseRow(track, 0.97);
    expect(row).toMatchObject({
      discogsId: 4570366,
      masterId: 525058,
      title: "Random Access Memories",
      artist: "Daft Punk",
      year: 2021,
      originalYear: 2013,
      releaseDate: "2021-02-19",
      country: "Europe",
      label: "Columbia",
      catalogNumber: "88883716861",
      barcode: "888837168618",
      score: 0.97,
    });
    expect(row?.genres).toEqual(["Electronic"]);
    expect(row?.styles).toEqual(["Disco", "Synth-pop"]);
  });

  it("falls back to the track artist when there is no album artist", () => {
    const row = toDiscogsReleaseRow({ ...track, albumArtist: undefined });
    expect(row?.artist).toBe("Daft Punk");
    expect(row?.score).toBeNull();
  });

  it("refuses a result with no release id or title", () => {
    expect(
      toDiscogsReleaseRow({ ...track, discogsReleaseId: undefined }),
    ).toBeUndefined();
    expect(toDiscogsReleaseRow({ ...track, album: "" })).toBeUndefined();
  });
});

describe("matchScore", () => {
  const response = (overrides: Partial<DiscogsEnrichResponse> = {}) =>
    ({
      track,
      matches: [
        { id: 999, artist: "Daft Punk", album: "Promo", score: 0.6 },
        { id: 4570366, artist: "Daft Punk", album: "RAM", score: 0.95 },
      ],
      ...overrides,
    }) as DiscogsEnrichResponse;

  it("takes the score of the candidate that was deep-fetched", () => {
    expect(matchScore(response())).toBe(0.95);
  });

  it("falls back to the best candidate when none matches the release", () => {
    expect(
      matchScore(response({ track: { ...track, discogsReleaseId: 1 } })),
    ).toBe(0.6);
  });

  it("has no score without candidates", () => {
    expect(matchScore(response({ matches: [] }))).toBeUndefined();
  });
});
