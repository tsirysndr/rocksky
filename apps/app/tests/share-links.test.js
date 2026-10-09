import assert from "node:assert/strict";
import test from "node:test";
import { parseSharePath, shareUrl, shareText, composePostText } from "../src/lib/shareLinks.ts";
const did = "did:plc:abc123";
for (const [kind, collection, screen] of [
  ["track", "song", "SongDetails"],
  ["album", "album", "AlbumDetails"],
  ["artist", "artist", "ArtistDetails"],
  ["scrobble", "scrobble", "SongDetails"],
]) {
  test(`${kind} shared web link opens the original record`, () => {
    const uri = `at://${did}/app.rocksky.${collection}/3abc`;
    const url = shareUrl({ kind, uri });
    assert.deepEqual(parseSharePath(new URL(url).pathname), {
      name: screen,
      params: { uri },
    });
    assert.deepEqual(parseSharePath(`${did}/${collection}/3abc`), {
      name: screen,
      params: { uri },
    });
  });
}
test("profile and wrapped links preserve account and year", () => {
  for (const actor of [did, "alice.bsky.social"]) {
    const url = new URL(shareUrl({ kind: "profile", uri: actor }));
    assert.deepEqual(parseSharePath(url.pathname), {
      name: "UserProfile",
      params: { did: actor },
    });
    const wrapped = new URL(
      shareUrl({ kind: "wrapped", uri: actor, year: 2025 }),
    );
    assert.deepEqual(parseSharePath(wrapped.pathname + wrapped.search), {
      name: "Wrapped",
      params: { did: actor, year: 2025 },
    });
  }
});
test("invalid and unrelated URLs never become record lookups", () => {
  for (const path of [
    "oauth/callback",
    "profile/%",
    "profile/a%2Fb",
    "did/song",
    "did/constructor/key",
    "did/song/a/b",
    "did/song/a%2Fb",
    "",
  ])
    assert.equal(parseSharePath(path), undefined);
  assert.throws(() =>
    shareUrl({ kind: "track", uri: `at://${did}/app.rocksky.album/3abc` }),
  );
});
test("track alias and trailing slashes work", () => {
  assert.deepEqual(parseSharePath(`/${did}/track/3abc/`), {
    name: "SongDetails",
    params: { uri: `at://${did}/app.rocksky.song/3abc` },
  });
});
test("sharing a scrobble keeps its record rather than substituting the track", () => {
  assert.match(
    shareText({
      kind: "scrobble",
      title: "Music",
      uri: `at://${did}/app.rocksky.scrobble/3abc`,
    }),
    /scrobble\/3abc$/,
  );
});

test("top-list cards share the owner's profile and preserve the selected period in text", () => {
  const item = {
    kind: "chart",
    uri: did,
    title: "Top Albums",
    subtitle: "Alice · 30 days",
    rankings: [
      { label: "30 days", names: ["Discovery", "Random Access Memories"] },
    ],
  };
  assert.equal(
    shareUrl(item),
    `https://rocksky.app/profile/${encodeURIComponent(did)}`,
  );
  assert.match(shareText(item), /Top Albums — Alice · 30 days/);
});

test("unmatched now-playing tracks can share text without inventing a public link", () => {
  assert.equal(
    shareText({
      kind: "track",
      uri: "",
      title: "Local song",
      subtitle: "Local artist",
    }),
    "Local song — Local artist\nListening on Rocksky\nhttps://rocksky.app",
  );
});

test("composer truncates long captions without dropping or breaking the Rocksky link", () => {
  const item = {kind: "track", uri: `at://${did}/app.rocksky.song/3abc`, title: "🎵".repeat(500), subtitle: "Artist"};
  for (const limit of [280, 300]) {
    const text = composePostText(item, limit);
    assert.ok(Array.from(text).length <= limit);
    assert.ok(text.endsWith(shareUrl(item)));
    assert.ok(!text.includes("\ufffd"));
  }
});
