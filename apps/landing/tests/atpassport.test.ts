import { expect, test } from "bun:test";
import { consumeAtPassportCallback, startAtPassport } from "../src/atpassport";

function flow() {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  const destination = new URL(
    startAtPassport("https://rocksky.app", storage, 1000),
  );
  const callback = new URL(destination.searchParams.get("callback")!);
  callback.searchParams.set(
    "atpstate",
    destination.searchParams.get("atpstate")!,
  );
  callback.searchParams.set("username", "alice.bsky.social");
  return { storage, destination, callback };
}

test("sends a fresh state and dedicated same-origin callback to AtPassport", () => {
  const { destination } = flow();
  expect(destination.origin + destination.pathname).toBe(
    "https://atpassport.net/authentication",
  );
  expect(destination.searchParams.get("callback")).toBe(
    "https://rocksky.app/atpassport/callback",
  );
  expect(destination.searchParams.get("atpstate")).toHaveLength(36);
  expect(flow().destination.searchParams.get("atpstate")).not.toBe(
    destination.searchParams.get("atpstate"),
  );
});

test("returns only the handle for OAuth and consumes state once", () => {
  const { callback, storage } = flow();
  callback.searchParams.set("username", "Alice.Bsky.Social");
  callback.searchParams.set("handle", "alice.bsky.social");
  callback.searchParams.set("did", "did:plc:untrusted");
  callback.searchParams.set("pdsurl", "https://untrusted.example");
  callback.searchParams.set("token", "not-a-session");
  expect(consumeAtPassportCallback(callback, storage, 2000)).toBe(
    "alice.bsky.social",
  );
  expect(() => consumeAtPassportCallback(callback, storage, 2000)).toThrow();
});

test("supports the documented handle alias", () => {
  const { callback, storage } = flow();
  callback.searchParams.delete("username");
  callback.searchParams.set("handle", "alice.example");
  expect(consumeAtPassportCallback(callback, storage, 2000)).toBe(
    "alice.example",
  );
});

test("rejects expired, missing, mismatched and duplicate states", () => {
  for (const variant of [
    "expired",
    "future",
    "missing",
    "mismatch",
    "duplicate",
    "path",
  ]) {
    const { callback, storage } = flow();
    if (variant === "missing") callback.searchParams.delete("atpstate");
    if (variant === "mismatch") callback.searchParams.set("atpstate", "wrong");
    if (variant === "duplicate")
      callback.searchParams.append("atpstate", "wrong");
    if (variant === "path") callback.pathname = "/";
    expect(() =>
      consumeAtPassportCallback(
        callback,
        storage,
        variant === "expired" ? 602000 : variant === "future" ? 0 : 2000,
      ),
    ).toThrow();
  }
});

test("rejects malformed, missing, conflicting and duplicate handles", () => {
  for (const variant of ["missing", "invalid", "conflicting", "duplicate"]) {
    const { callback, storage } = flow();
    if (variant === "missing") callback.searchParams.delete("username");
    if (variant === "invalid")
      callback.searchParams.set(
        "username",
        "https://evil.example/?prompt=create",
      );
    if (variant === "conflicting")
      callback.searchParams.set("handle", "bob.example");
    if (variant === "duplicate")
      callback.searchParams.append("username", "bob.example");
    expect(() => consumeAtPassportCallback(callback, storage, 2000)).toThrow();
  }
});

test("does not start a redirect if state cannot be saved", () => {
  const storage = {
    getItem: () => null,
    removeItem: () => {},
    setItem: () => {
      throw new Error("Storage blocked");
    },
  };
  expect(() => startAtPassport("https://rocksky.app", storage)).toThrow(
    "Storage blocked",
  );
});
