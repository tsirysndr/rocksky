import { expect, test } from "bun:test";
import { shareCardActor, shareCardIdentity } from "./shareCardIdentity";
import type { ShareItem } from "./shareLinks";

const viewer = {
  did: "did:plc:viewer",
  displayName: "Tsiry",
  handle: "tsiry-sandratraina.com",
};
const other = {
  did: "did:plc:other",
  displayName: "Other listener",
  handle: "other.test",
};

test("music cards use the listener, not the catalog record's repository", () => {
  for (const kind of ["track", "album", "artist"] as const) {
    const item = {
      kind,
      uri: `at://did:plc:indexer/app.rocksky.${kind}/abc`,
      title: "Music",
    };
    expect(shareCardActor(item, viewer.did)).toBe(viewer.did);
  }
  expect(
    shareCardActor(
      { kind: "track", uri: "", title: "Local track" },
      viewer.did,
    ),
  ).toBe(viewer.did);
});

test("scrobble and personal stats cards retain their owner when shared by someone else", () => {
  const scrobble: ShareItem = {
    kind: "scrobble",
    uri: "at://did:plc:other/app.rocksky.scrobble/abc",
    title: "Song",
  };
  expect(shareCardActor(scrobble, viewer.did)).toBe(other.did);
  for (const kind of ["profile", "wrapped", "chart"] as const)
    expect(
      shareCardActor({ kind, uri: other.did, title: "Listening" }, viewer.did),
    ).toBe(other.did);
  expect(
    shareCardActor(
      { kind: "track", uri: "", title: "Story track", owner: other },
      viewer.did,
    ),
  ).toBe(other.did);
});

test("display name and handle are separate, trimmed and contain exactly one @", () => {
  expect(
    shareCardIdentity(viewer.did, {
      ...viewer,
      displayName: "  Tsiry  ",
      handle: " @tsiry-sandratraina.com ",
    }),
  ).toEqual({
    displayName: "Tsiry",
    handle: "@tsiry-sandratraina.com",
    ready: true,
  });
  expect(
    shareCardIdentity(viewer.did, { ...viewer, displayName: "" }).displayName,
  ).toBe(viewer.handle);
});

test("waits for a handle-only story profile and never substitutes the viewer", () => {
  expect(
    shareCardIdentity(
      other.did,
      { did: other.did, handle: other.handle },
      viewer,
    ).ready,
  ).toBe(false);
  expect(shareCardIdentity(other.did, undefined, undefined, viewer)).toEqual({
    displayName: "",
    handle: "",
    ready: false,
  });
  expect(shareCardIdentity(other.did, other, viewer).displayName).toBe(
    other.displayName,
  );
  expect(
    shareCardIdentity(
      viewer.did,
      { ...viewer, displayName: "New name" },
      viewer,
    ).displayName,
  ).toBe("New name");
  expect(shareCardIdentity("", viewer).ready).toBe(false);
});
