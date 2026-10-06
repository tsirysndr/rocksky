import { describe, expect, it } from "bun:test";
import type { SelectDiscogsRelease } from "schema/discogs-releases";
import { toDiscogsView } from "./discogsView";

const release = {
  id: "rel_1",
  discogsId: 4570366,
  masterId: 525058,
  title: "Random Access Memories",
  artist: "Daft Punk",
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
  score: 0.9712,
  creditsFetchedAt: new Date(0),
  createdAt: new Date(0),
  updatedAt: new Date(0),
  xataVersion: 0,
} satisfies SelectDiscogsRelease;

describe("toDiscogsView", () => {
  it("returns nothing for an album with no match", () => {
    expect(toDiscogsView(null)).toBeUndefined();
    expect(toDiscogsView(undefined)).toBeUndefined();
  });

  it("reports the score as a percentage", () => {
    expect(toDiscogsView(release)?.score).toBe(97);
  });

  it("keeps a zero score rather than dropping it", () => {
    expect(toDiscogsView({ ...release, score: 0 })?.score).toBe(0);
  });

  it("leaves the score out when it was never recorded", () => {
    expect(toDiscogsView({ ...release, score: null })?.score).toBeUndefined();
  });

  it("maps the release onto the lexicon view", () => {
    expect(toDiscogsView(release)).toMatchObject({
      releaseId: 4570366,
      masterId: 525058,
      title: "Random Access Memories",
      artist: "Daft Punk",
      year: 2021,
      originalYear: 2013,
      country: "Europe",
      label: "Columbia",
      catalogNumber: "88883716861",
      barcode: "888837168618",
      url: "https://www.discogs.com/release/4570366",
    });
  });

  it("omits optional columns that are null", () => {
    const view = toDiscogsView({
      ...release,
      masterId: null,
      genres: null,
      styles: null,
      formats: null,
      albumArt: null,
    });
    expect(view?.masterId).toBeUndefined();
    expect(view?.genres).toBeUndefined();
    expect(view?.formats).toBeUndefined();
    expect(view?.albumArt).toBeUndefined();
  });
});

describe("toDiscogsView credits", () => {
  const credit = {
    id: "cr_1",
    releaseId: "rel_1",
    artistId: 141,
    name: "Pharrell Williams",
    role: "Vocals",
    tracks: "C2",
    position: 0,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    xataVersion: 0,
  };

  it("leaves credits out when there are none", () => {
    expect(toDiscogsView(release)?.credits).toBeUndefined();
    expect(toDiscogsView(release, { credits: [] })?.credits).toBeUndefined();
  });

  it("maps credits onto the lexicon view", () => {
    expect(toDiscogsView(release, { credits: [credit] })?.credits).toEqual([
      {
        artistId: 141,
        name: "Pharrell Williams",
        role: "Vocals",
        tracks: "C2",
      },
    ]);
  });

  it("omits the fields a credit does not carry", () => {
    const view = toDiscogsView(release, {
      credits: [{ ...credit, artistId: null, role: null, tracks: null }],
    })?.credits?.[0];
    expect(view).toEqual({
      artistId: undefined,
      name: "Pharrell Williams",
      role: undefined,
      tracks: undefined,
    });
  });
});

describe("toDiscogsView relations", () => {
  const stamps = {
    createdAt: new Date(0),
    updatedAt: new Date(0),
    xataVersion: 0,
  };

  it("returns the tracklist in order with parsed numbers", () => {
    const view = toDiscogsView(release, {
      tracklist: [
        {
          id: "t_1",
          releaseId: "rel_1",
          position: "C2",
          type: "track",
          title: "Get Lucky",
          duration: "6:09",
          durationMs: 369000,
          discNumber: 2,
          trackNumber: 2,
          idx: 0,
          ...stamps,
        },
      ],
    });
    expect(view?.tracklist).toEqual([
      {
        position: "C2",
        type: "track",
        title: "Get Lucky",
        duration: "6:09",
        durationMs: 369000,
        discNumber: 2,
        trackNumber: 2,
      },
    ]);
  });

  it("keeps labels and companies apart by kind", () => {
    const view = toDiscogsView(release, {
      labels: [
        {
          id: "l_1",
          releaseId: "rel_1",
          labelId: 1866,
          name: "Columbia",
          catalogNumber: "88883716861",
          kind: "label",
          entityType: null,
          position: 0,
          ...stamps,
        },
        {
          id: "l_2",
          releaseId: "rel_1",
          labelId: 99,
          name: "Sony DADC",
          catalogNumber: null,
          kind: "company",
          entityType: "Pressed By",
          position: 0,
          ...stamps,
        },
      ],
    });
    expect(view?.labels?.map((l) => [l.kind, l.name, l.entityType])).toEqual([
      ["label", "Columbia", undefined],
      ["company", "Sony DADC", "Pressed By"],
    ]);
  });

  it("maps identifiers and release artists", () => {
    const view = toDiscogsView(release, {
      identifiers: [
        {
          id: "i_1",
          releaseId: "rel_1",
          type: "Barcode",
          value: "888837168618",
          description: "Printed",
          position: 0,
          ...stamps,
        },
      ],
      artists: [
        {
          id: "a_1",
          releaseId: "rel_1",
          artistId: 1289,
          name: "Daft Punk",
          anv: null,
          joinPhrase: "Feat.",
          role: null,
          position: 0,
          ...stamps,
        },
      ],
    });
    expect(view?.identifiers).toEqual([
      { type: "Barcode", value: "888837168618", description: "Printed" },
    ]);
    expect(view?.artists).toEqual([
      {
        artistId: 1289,
        name: "Daft Punk",
        anv: undefined,
        joinPhrase: "Feat.",
        role: undefined,
      },
    ]);
  });

  it("maps the master and omits it when absent", () => {
    expect(toDiscogsView(release, {})?.master).toBeUndefined();
    expect(
      toDiscogsView(release, {
        master: {
          id: "m_1",
          discogsId: 525058,
          title: "Random Access Memories",
          artist: "Daft Punk",
          year: 2013,
          mainReleaseId: 4570366,
          discogsUrl: "https://www.discogs.com/master/525058",
          genres: ["Electronic"],
          styles: null,
          ...stamps,
        },
      })?.master,
    ).toEqual({
      masterId: 525058,
      title: "Random Access Memories",
      artist: "Daft Punk",
      year: 2013,
      mainReleaseId: 4570366,
      url: "https://www.discogs.com/master/525058",
      genres: ["Electronic"],
      styles: undefined,
    });
  });
});
