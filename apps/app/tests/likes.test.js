import { expect, mock, test } from "bun:test";

const get = mock(async () => ({ data: {} }));
mock.module("axios", () => ({ default: { get } }));
mock.module("../src/storage", () => ({
  storage: { getToken: () => "test", getDid: () => "test" },
}));
mock.module("../src/consts", () => ({ API_URL: "https://example.invalid" }));
const { getSongLikeState } = await import("../src/api/likes");

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
