import { expect, test } from "bun:test";
import { storyLinks } from "./storyLinks";

test("available service links retain their order and target the exact records", () => {
  const links = storyLinks({
    spotifyLink: "https://open.spotify.com/track/abc",
    mbId: "12345678-1234-1234-1234-123456789abc",
    discogsLink: "https://www.discogs.com/release/123",
    uri: "at://did:plc:listener/app.rocksky.scrobble/abc",
  });
  expect(links.map((link) => link.name)).toEqual([
    "Spotify",
    "MusicBrainz",
    "Discogs",
    "PDSls",
  ]);
  expect(links[1].url).toBe(
    "https://musicbrainz.org/recording/12345678-1234-1234-1234-123456789abc",
  );
  expect(links[3].url).toBe(
    "https://pdsls.dev/at/did:plc:listener/app.rocksky.scrobble/abc",
  );
});

test("missing or invalid links produce no buttons", () => {
  expect(storyLinks({})).toEqual([]);
  expect(
    storyLinks({
      spotifyLink: "javascript:alert(1)",
      mbId: "invalid",
      discogsLink: "https://example.com",
      uri: "not-a-record",
    }),
  ).toEqual([]);
  expect(
    storyLinks({ uri: "at://did:plc:catalog/app.rocksky.song/abc" }).map(
      (link) => link.name,
    ),
  ).toEqual(["PDSls"]);
});
