import { describe, expect, it } from "bun:test";
import { creditsArtist, fold } from "./credits";

describe("creditsArtist", () => {
  it("rejects a track by someone else", () => {
    // The stray artist_tracks row this guard exists for: Slipknot's page was
    // listing "Baby" by Cannons.
    expect(
      creditsArtist("Slipknot", { artist: "Cannons", albumArtist: "Cannons" }),
    ).toBe(false);
  });

  it("keeps a collaboration, where the artist is one credit of several", () => {
    expect(
      creditsArtist("Princess Superstar", {
        artist: "Mason, Princess Superstar",
        albumArtist: "Mason",
      }),
    ).toBe(true);
  });

  it("keeps a track credited only as the album artist", () => {
    expect(
      creditsArtist("Slipknot", {
        artist: "Slipknot, Corey Taylor",
        albumArtist: "Slipknot",
      }),
    ).toBe(true);
  });

  it("ignores case and surrounding whitespace", () => {
    expect(
      creditsArtist("  tones and i ", {
        artist: "Tones And I",
        albumArtist: "Tones And I",
      }),
    ).toBe(true);
  });

  it("keeps a track whose credit is the shorter of the two", () => {
    // artists.name is sometimes the joint credit and tracks.artist one half
    // of it, so containment has to hold in both directions.
    expect(
      creditsArtist("Nujabes / fat jon", {
        artist: "fat jon",
        albumArtist: "fat jon",
      }),
    ).toBe(true);
  });

  it("folds case outside ASCII, which the database does not", () => {
    expect(
      creditsArtist("Sälen", { artist: "SÄLEN", albumArtist: "SÄLEN" }),
    ).toBe(true);
  });

  it("looks past how a name is spelled across sources", () => {
    expect(creditsArtist("JAŸ-Z", { artist: "JAY-Z" })).toBe(true);
    expect(
      creditsArtist("Jóhann Jóhannsson", { artist: "Johann Johannsson" }),
    ).toBe(true);
    // U+2010 hyphen against an ASCII one
    expect(
      creditsArtist("The 8-Bit Big Band", { artist: "The 8‐Bit Big Band" }),
    ).toBe(true);
  });

  it("rejects an artist with no name rather than matching everything", () => {
    expect(creditsArtist("", { artist: "Cannons" })).toBe(false);
    expect(creditsArtist(null, { artist: "Cannons" })).toBe(false);
  });

  it("rejects a track with no credited artist", () => {
    expect(creditsArtist("Slipknot", { artist: "", albumArtist: null })).toBe(
      false,
    );
  });
});

describe("fold", () => {
  it("strips diacritics, flattens punctuation and lowercases", () => {
    expect(fold("Sigur Rós")).toBe("sigur ros");
    expect(fold(" Guns ’n’  Roses ")).toBe("guns 'n' roses");
    expect(fold("8‐Bit")).toBe("8-bit");
  });
});
