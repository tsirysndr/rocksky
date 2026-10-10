import { expect, test } from "bun:test";
import { linking } from "./linking";

test("HTTP and HTTPS on both public hosts resolve all supported destinations", () => {
  const paths = [
    ["profile/tsiry-sandratraina.com", "UserProfile"],
    ["profile/did%3Aplc%3Alistener?wrapped=2025", "Wrapped"],
    ["did%3Aplc%3Alistener/song/record", "SongDetails"],
    ["did%3Aplc%3Alistener/track/record", "SongDetails"],
    ["did%3Aplc%3Alistener/scrobble/record", "SongDetails"],
    ["did%3Aplc%3Alistener/album/record", "AlbumDetails"],
    ["did%3Aplc%3Alistener/artist/record", "ArtistDetails"],
  ];
  for (const host of ["rocksky.app", "m.rocksky.app"]) {
    for (const scheme of ["http", "https"]) {
      const prefix = `${scheme}://${host}`;
      expect(linking.prefixes).toContain(prefix);
      for (const [path, screen] of paths) {
        const state = linking.getStateFromPath!(`/${path}`, undefined);
        const stack = state?.routes[0].state?.routes[0].state;
        expect(stack?.routes.at(-1)?.name).toBe(screen);
      }
    }
  }
});

test("web auth and unsupported pages are not mapped to native screens", () => {
  for (const path of ["/oauth/callback", "/login", "/privacy", "/unknown"]) {
    expect(linking.getStateFromPath!(path, undefined)).toBeUndefined();
  }
});
