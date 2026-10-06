import { describe, expect, it } from "bun:test";
import type { DiscogsRelease } from "./discogs";
import {
  joinArtistCredits,
  parseDurationMs,
  parsePosition,
  toIdentifierRows,
  toMasterRow,
  toReleaseArtistRows,
  toReleaseLabelRows,
  toTrackRows,
} from "./discogsRelation";

describe("parsePosition", () => {
  it("reads the forms Discogs prints", () => {
    expect(parsePosition("7")).toEqual([0, 7]);
    expect(parsePosition("2-04")).toEqual([2, 4]);
    expect(parsePosition("1.3")).toEqual([1, 3]);
    // Sides A and B share a disc; C starts the second.
    expect(parsePosition("A1")).toEqual([1, 1]);
    expect(parsePosition("B2")).toEqual([1, 2]);
    expect(parsePosition("C2")).toEqual([2, 2]);
  });

  it("gives up on what it cannot read", () => {
    expect(parsePosition("")).toEqual([0, 0]);
    expect(parsePosition("Video")).toEqual([0, 0]);
  });
});

describe("parseDurationMs", () => {
  it("reads m:ss and h:mm:ss", () => {
    expect(parseDurationMs("6:09")).toBe(369000);
    expect(parseDurationMs("1:02:03")).toBe(3723000);
  });

  it("is zero for anything else", () => {
    expect(parseDurationMs("")).toBe(0);
    expect(parseDurationMs("nope")).toBe(0);
  });
});

describe("joinArtistCredits", () => {
  it("rebuilds the credit with Discogs' join phrases", () => {
    expect(
      joinArtistCredits([
        { name: "Daft Punk", join: "Feat." },
        { name: "Pharrell Williams" },
      ]),
    ).toBe("Daft Punk Feat. Pharrell Williams");
  });

  it("treats a comma join as a plain list", () => {
    expect(joinArtistCredits([{ name: "A", join: "," }, { name: "B" }])).toBe(
      "A, B",
    );
  });

  it("prefers the name as credited", () => {
    expect(
      joinArtistCredits([{ name: "Nile Rodgers (2)", anv: "Nile Rodgers" }]),
    ).toBe("Nile Rodgers");
  });
});

describe("toTrackRows", () => {
  it("keeps headings and parses the playable entries", () => {
    const rows = toTrackRows("rel_1", [
      { position: "", type_: "heading", title: "Side C" },
      { position: "C2", type_: "track", title: "Get Lucky", duration: "6:09" },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      type: "heading",
      title: "Side C",
      idx: 0,
      position: null,
      durationMs: null,
      discNumber: null,
    });
    expect(rows[1]).toMatchObject({
      position: "C2",
      title: "Get Lucky",
      durationMs: 369000,
      discNumber: 2,
      trackNumber: 2,
      idx: 1,
    });
  });

  it("drops entries with no title", () => {
    expect(toTrackRows("rel_1", [{ title: "  " }])).toEqual([]);
  });
});

describe("toReleaseLabelRows", () => {
  const release: Pick<DiscogsRelease, "labels" | "companies"> = {
    labels: [
      { id: 1866, name: "Columbia", catno: "88883716861" },
      { id: 42, name: "Daft Life Ltd.", catno: "88883716861" },
    ],
    companies: [{ id: 99, name: "Sony DADC", entity_type_name: "Pressed By" }],
  };

  it("keeps every label, not just the first", () => {
    const rows = toReleaseLabelRows("rel_1", release);
    expect(rows.filter((r) => r.kind === "label")).toHaveLength(2);
    expect(rows.map((r) => r.position)).toEqual([0, 1, 0]);
  });

  it("marks companies and keeps their role", () => {
    const company = toReleaseLabelRows("rel_1", release).find(
      (r) => r.kind === "company",
    );
    expect(company).toMatchObject({
      name: "Sony DADC",
      entityType: "Pressed By",
      catalogNumber: null,
    });
  });
});

describe("toIdentifierRows", () => {
  it("keeps every identifier, not just the barcode", () => {
    const rows = toIdentifierRows("rel_1", [
      { type: "Barcode", value: "888837168618", description: "Printed" },
      { type: "Matrix / Runout", value: "88883716861-A" },
      { type: "Rights Society", value: "BIEM/GEMA" },
    ]);
    expect(rows.map((r) => r.type)).toEqual([
      "Barcode",
      "Matrix / Runout",
      "Rights Society",
    ]);
    expect(rows[1]).toMatchObject({ description: null, position: 1 });
  });
});

describe("toReleaseArtistRows", () => {
  it("keeps the join phrase so the credit can be rebuilt", () => {
    const rows = toReleaseArtistRows("rel_1", [
      { id: 1289, name: "Daft Punk", join: "Feat." },
      { id: 141, name: "Pharrell Williams" },
    ]);
    expect(rows[0]).toMatchObject({ artistId: 1289, joinPhrase: "Feat." });
    expect(rows[1]).toMatchObject({ joinPhrase: null, position: 1 });
  });
});

describe("toMasterRow", () => {
  it("maps the master and joins its artists", () => {
    expect(
      toMasterRow({
        id: 525058,
        title: "Random Access Memories",
        year: 2013,
        main_release: 4570366,
        uri: "https://www.discogs.com/master/525058",
        artists: [{ id: 1289, name: "Daft Punk" }],
        genres: ["Electronic"],
      }),
    ).toEqual({
      discogsId: 525058,
      title: "Random Access Memories",
      artist: "Daft Punk",
      year: 2013,
      mainReleaseId: 4570366,
      discogsUrl: "https://www.discogs.com/master/525058",
      genres: ["Electronic"],
      styles: null,
    });
  });

  it("refuses a master with no id or title", () => {
    expect(toMasterRow({ id: 0, title: "x" })).toBeUndefined();
    expect(toMasterRow({ id: 1, title: " " })).toBeUndefined();
  });
});
