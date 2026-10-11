import { describe, expect, it } from "bun:test";
import {
  loadStoryLinks,
  storyPath,
  shoutUri,
  STORY_DURATION,
  storyShare,
  storyGif,
  type StoryItem,
} from "./storyModel";
const story: StoryItem = {
  id: "1",
  title: "Title",
  artist: "Artist",
  did: "did:plc:user",
  handle: "user.test",
  createdAt: "2026-10-11",
  trackUri: "at://did:plc:music/app.rocksky.song/song",
  uri: "at://did:plc:user/app.rocksky.scrobble/play",
};
describe("browser story parity", () => {
  it("uses 15 seconds and routes only supported record URIs", () => {
    expect(STORY_DURATION).toBe(15000);
    expect(storyPath(story.uri)).toBe("/did:plc:user/scrobble/play");
    expect(storyPath("https://evil.test/path")).toBeUndefined();
    expect(
      storyPath("at://did:plc:user/app.bsky.feed.post/id"),
    ).toBeUndefined();
    expect(shoutUri(story)).toBe(story.trackUri);
    expect(shoutUri({ ...story, trackUri: undefined })).toBe(story.uri);
  });
  it("orders services like Android and resolves Discogs from album metadata", async () => {
    const links = await loadStoryLinks(
      story,
      async () => ({
        spotifyLink: "https://open.spotify.com/track/123",
        mbId: "12345678-1234-1234-1234-123456789abc",
        albumUri: "at://did:plc:music/app.rocksky.album/album",
      }),
      async (did, rkey) => {
        expect([did, rkey]).toEqual(["did:plc:music", "album"]);
        return { discogs: { masterId: 42 } };
      },
    );
    expect(links.map((l) => l.name)).toEqual([
      "Spotify",
      "MusicBrainz",
      "Discogs",
      "PDSls",
    ]);
    expect(links[2].url).toBe("https://www.discogs.com/master/42");
  });
  it("retains usable links when album or song requests fail", async () => {
    const fail = async (): Promise<never> => {
      throw new Error("offline");
    };
    expect(
      (await loadStoryLinks(story, fail, fail)).map((l) => l.name),
    ).toEqual(["PDSls"]);
    expect(
      (
        await loadStoryLinks(
          story,
          async () => ({
            spotifyLink: "https://open.spotify.com/track/123",
            albumUri: "at://did:plc:music/app.rocksky.album/album",
          }),
          fail,
        )
      ).map((l) => l.name),
    ).toEqual(["Spotify", "PDSls"]);
  });
});

it("offers the story link and an encoded Bluesky compose link", () => {
  const shared = storyShare({
    ...story,
    title: "A & B #1",
    artist: "Artist 🦋",
  })!;
  expect(shared.url).toBe("https://rocksky.app/did:plc:user/scrobble/play");
  const bluesky = new URL(shared.bluesky);
  expect(bluesky.origin + bluesky.pathname).toBe(
    "https://bsky.app/intent/compose",
  );
  expect(bluesky.searchParams.get("text")).toBe(
    `A & B #1 — Artist 🦋\n${shared.url}`,
  );
  expect(storyShare({ ...story, uri: undefined })?.url).toContain("/song/song");
  expect(
    storyShare({ ...story, uri: undefined, trackUri: undefined }),
  ).toBeUndefined();
});
it("passes the media embed including clip metadata without picker-only fields", () => {
  expect(
    storyGif({
      id: "clip-1",
      isVideo: true,
      url: "https://example.com/clip.mp4",
      previewUrl: "https://example.com/preview.jpg",
      alt: "Dancing",
      width: 300,
      height: 200,
    }),
  ).toEqual({
    url: "https://example.com/clip.mp4",
    previewUrl: "https://example.com/preview.jpg",
    alt: "Dancing",
    width: 300,
    height: 200,
  });
});
