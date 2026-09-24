import { describe, expect, test } from "bun:test";
import { authUrl, handleError, normalizeHandle } from "../src/auth";

describe("Atmosphere sign-in handoff", () => {
  test("accepts a full handle or custom domain and removes the optional @", () => {
    expect(normalizeHandle("  @Listener.BSKY.Social  ")).toBe(
      "listener.bsky.social",
    );
    expect(handleError("@listener.bsky.social")).toBeUndefined();
    expect(handleError("music.example.org")).toBeUndefined();
    expect(handleError("my-music.example")).toBeUndefined();
  });

  test("rejects missing, incomplete, and malformed handles", () => {
    for (const value of [
      "",
      "@",
      "listener",
      "name..social",
      "-name.example",
      "name-.example",
      "hello world.example",
      "https://example.org",
      "name.example?prompt=create",
      "name.123",
      `${"a".repeat(64)}.social`,
    ]) {
      expect(handleError(value)).toBeDefined();
    }
  });

  test("matches the hosted web app login URL without creating a local session", () => {
    const url = new URL(
      authUrl("https://rocksky.pages.dev/loading", " @Listener.Bsky.Social "),
    );
    expect(url.origin).toBe("https://rocksky.pages.dev");
    expect(url.pathname).toBe("/loading");
    expect(url.searchParams.get("handle")).toBe("listener.bsky.social");
    expect(url.searchParams.has("prompt")).toBe(false);
  });

  test("uses the existing account-creation prompt and configurable gateway", () => {
    const create = new URL(
      authUrl("https://rocksky.pages.dev/loading?handle=old.test"),
    );
    expect(create.searchParams.get("prompt")).toBe("create");
    expect(create.searchParams.has("handle")).toBe(false);
    const custom = new URL(
      authUrl("https://music.example/login?prompt=create", "listener.example"),
    );
    expect(custom.origin).toBe("https://music.example");
    expect(custom.searchParams.get("handle")).toBe("listener.example");
    expect(custom.searchParams.has("prompt")).toBe(false);
  });

  test("encodes query parameters rather than injecting extra auth options", () => {
    const url = new URL(
      authUrl("https://rocksky.pages.dev/loading", "name.test&prompt=create"),
    );
    expect(url.searchParams.has("prompt")).toBe(false);
    expect(url.searchParams.get("handle")).toBe("name.test&prompt=create");
  });
});
