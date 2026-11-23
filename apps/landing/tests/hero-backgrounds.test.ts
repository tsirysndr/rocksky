import { describe, expect, test } from "bun:test";
import backgrounds from "../src/hero-album-sources.json";

describe("hero album background assets", () => {
  test("ships three transparent images with no repeated covers or placeholder artwork", async () => {
    expect(backgrounds).toHaveLength(3);
    const albums = backgrounds.flatMap((background) => background.albums);
    expect(new Set(albums.map((album) => album.sha256)).size).toBe(
      albums.length,
    );
    expect(
      new Set(
        albums.map((album) =>
          `${album.artist}|${album.title}`
            .normalize("NFKC")
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim(),
        ),
      ).size,
    ).toBe(albums.length);
    for (const background of backgrounds) {
      expect(background.hasAlpha).toBe(true);
      expect(background.width).toBe(2560);
      expect(background.height).toBe(1440);
      expect(background.albums.length).toBeGreaterThanOrEqual(48);
      const file = Bun.file(
        new URL(`../public/${background.file}`, import.meta.url),
      );
      expect(await file.exists()).toBe(true);
      const bytes = Buffer.from(await file.slice(0, 12).arrayBuffer());
      expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
      expect(bytes.toString("ascii", 8, 12)).toBe("WEBP");
      for (const album of background.albums) {
        expect(album.source).not.toMatch(
          /2a96cbd8b46e442fc41c2b86b821562f|placeholder|default[_-]?(album|cover)|no[_-]?(image|cover)/i,
        );
      }
    }
  });
});
