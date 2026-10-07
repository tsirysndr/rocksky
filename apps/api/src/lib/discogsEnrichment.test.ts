import { describe, expect, it } from "bun:test";
import type { DiscogsEnrichResponse, DiscogsEnrichedTrack } from "./discogs";
import {
  MISS_RETRY_MS,
  discogsSearchKey,
  isStaleSearch,
  matchScore,
  toDiscogsCreditRows,
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

describe("toDiscogsCreditRows", () => {
  it("keeps Discogs' order and maps every field", () => {
    const rows = toDiscogsCreditRows("rel_1", [
      {
        artistId: 141,
        name: "Pharrell Williams",
        role: "Vocals",
        tracks: "C2",
      },
      { name: "Mick Guzauski", role: "Mixed By" },
    ]);
    expect(rows).toEqual([
      {
        releaseId: "rel_1",
        artistId: 141,
        name: "Pharrell Williams",
        role: "Vocals",
        tracks: "C2",
        position: 0,
      },
      {
        releaseId: "rel_1",
        artistId: null,
        name: "Mick Guzauski",
        role: "Mixed By",
        tracks: null,
        position: 1,
      },
    ]);
  });

  it("drops nameless credits and renumbers what is left", () => {
    const rows = toDiscogsCreditRows("rel_1", [
      { name: "  " },
      { name: "Nile Rodgers", role: "Guitar" },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Nile Rodgers", position: 0 });
  });

  it("has nothing to store when a release has no credits", () => {
    expect(toDiscogsCreditRows("rel_1")).toEqual([]);
    expect(toDiscogsCreditRows("rel_1", [])).toEqual([]);
  });
});

describe("interrupted release persistence", () => {
  it("retries partial releases before marking their children complete", async () => {
    const { enrichAlbumWithDiscogs } = await import("./discogsEnrichment");
    const { retryPgConnection } = await import("./pgConnectionRecovery");
    const { default: tables } = await import("schema");
    let release: Record<string, unknown> = {
      id: "release-1",
      creditsFetchedAt: null,
    };
    let transactions = 0;
    let requests = 0;
    let completedAfter = 0;
    const db = {
      select: () => ({
        from: (table: unknown) => ({
          where: () => ({
            limit: async () =>
              table === tables.discogsSearches
                ? [{ releaseId: "release-1", searchedAt: new Date() }]
                : table === tables.discogsReleases
                  ? [{ ...release }]
                  : [],
          }),
        }),
      }),
      insert: (table: unknown) => ({
        values: (values: Record<string, unknown>) => ({
          onConflictDoUpdate: () => {
            if (table === tables.discogsReleases) {
              release = { id: "release-1", ...values };
              return { returning: async () => [{ ...release }] };
            }
            return Promise.resolve();
          },
        }),
      }),
      update: () => ({
        set: (values: Record<string, unknown>) => ({
          where: async () => {
            completedAfter = transactions;
            release = { ...release, ...values };
          },
        }),
      }),
      transaction: async (run: (tx: unknown) => Promise<void>) => {
        transactions++;
        expect(release.creditsFetchedAt).toBeNull();
        if (transactions === 1)
          throw new Error("Connection terminated unexpectedly");
        await run({ delete: () => ({ where: async () => {} }) });
      },
    };
    const ctx = {
      db,
      discogs: {
        post: async () => {
          requests++;
          return {
            data: {
              matches: [],
              track: { ...track, discogsMasterId: null, credits: [] },
            },
          };
        },
        get: async () => ({
          data: {
            id: 4570366,
            artists: [],
            labels: [],
            identifiers: [],
            tracklist: [],
          },
        }),
      },
    };
    const result = await retryPgConnection(
      () =>
        enrichAlbumWithDiscogs(
          ctx as unknown as import("context").Context,
          "Daft Punk",
          "Random Access Memories",
          "album-1",
        ),
      { sleep: async () => {} },
    );
    expect(result.status).toBe("matched");
    expect(requests).toBe(2);
    expect(completedAfter).toBe(3);
    expect(release.creditsFetchedAt).toBeInstanceOf(Date);
  });
});
