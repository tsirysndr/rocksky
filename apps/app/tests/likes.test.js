import { expect, mock, test } from "bun:test";

const get = mock(async () => ({ data: {} }));
const post = mock(async () => ({ data: {} }));
const remove = mock(async () => ({ data: {} }));
mock.module("axios", () => ({ default: { get, post, delete: remove } }));
mock.module("../src/storage", () => ({
  storage: { getToken: () => "test", getDid: () => "test" },
}));
mock.module("../src/consts", () => ({ API_URL: "https://example.invalid" }));
const { getSongLikeState, setTrackLiked } = await import("../src/api/likes");

test("empty or missing liked responses do not mean unliked", async () => {
  get.mockResolvedValueOnce({ data: {} });
  expect(await getSongLikeState({ mbid: "unknown" })).toBeNull();
  get.mockResolvedValueOnce({ data: { uri: "at://song" } });
  expect(await getSongLikeState({ uri: "at://song" })).toBeNull();
});
test("authenticated lookup preserves true and false love states", async () => {
  for (const liked of [true, false]) {
    get.mockResolvedValueOnce({ data: { uri: "at://song", liked } });
    expect(await getSongLikeState({ uri: "at://song" })).toEqual({
      uri: "at://song",
      liked,
    });
  }
  expect(get.mock.calls.at(-1)?.[1]).toEqual({
    params: { uri: "at://song" },
    headers: { Authorization: "Bearer test" },
  });
});

test("scrobble hearts address the song record for both like and unlike", async () => {
  const trackUri = "at://did:plc:test/app.rocksky.song/song123";
  await setTrackLiked({ trackUri }, true);
  expect(post.mock.calls.at(-1)?.[0]).toBe(
    "https://example.invalid/users/did:plc:test/app.rocksky.song/song123/likes",
  );
  await setTrackLiked({ trackUri }, false);
  expect(remove.mock.calls.at(-1)?.[0]).toBe(post.mock.calls.at(-1)?.[0]);
});

test("tracks without song records use their track ID, never a scrobble ID", async () => {
  await setTrackLiked({ trackId: "track123" }, true);
  expect(post.mock.calls.at(-1)?.[0]).toBe(
    "https://example.invalid/users/tracks/track123/likes",
  );
  await setTrackLiked({ trackId: "track123" }, false);
  expect(remove.mock.calls.at(-1)?.[0]).toBe(
    "https://example.invalid/users/tracks/track123/likes",
  );
  const before = post.mock.calls.length;
  await expect(
    setTrackLiked(
      { trackUri: "at://did:plc:test/app.rocksky.scrobble/event123" },
      true,
    ),
  ).rejects.toThrow("no song available");
  expect(post.mock.calls.length).toBe(before);
});
