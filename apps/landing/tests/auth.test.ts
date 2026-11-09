import { describe, expect, test } from "bun:test";
import {
  authGateway,
  authUrl,
  handleError,
  normalizeHandle,
} from "../src/auth";

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

  test("starts sign-in at the API without the intermediate loading page", () => {
    const url = new URL(authUrl(authGateway(), " @Listener.Bsky.Social "));
    expect(url.origin).toBe("https://api.rocksky.app");
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("handle")).toBe("listener.bsky.social");
    expect(url.searchParams.has("prompt")).toBe(false);
  });

  test("uses the existing account-creation prompt and configurable gateway", () => {
    const create = new URL(authUrl(`${authGateway()}?handle=old.test`));
    expect(create.origin).toBe("https://api.rocksky.app");
    expect(create.pathname).toBe("/login");
    expect(create.searchParams.get("prompt")).toBe("create");
    expect(create.searchParams.has("handle")).toBe(false);
    const custom = new URL(
      authUrl("https://music.example/login?prompt=create", "listener.example"),
    );
    expect(custom.origin).toBe("https://music.example");
    expect(custom.searchParams.get("handle")).toBe("listener.example");
    expect(custom.searchParams.has("prompt")).toBe(false);
  });

  test("uses the configured API base and preserves an explicit gateway override", () => {
    expect(authGateway("https://api.example/")).toBe(
      "https://api.example/login",
    );
    expect(authGateway("https://example/api")).toBe(
      "https://example/api/login",
    );
    expect(authGateway("", "")).toBe("https://api.rocksky.app/login");
    expect(
      authGateway("https://api.example", "https://auth.example/start"),
    ).toBe("https://auth.example/start");
  });

  test("encodes query parameters rather than injecting extra auth options", () => {
    const url = new URL(authUrl(authGateway(), "name.test&prompt=create"));
    expect(url.searchParams.has("prompt")).toBe(false);
    expect(url.searchParams.get("handle")).toBe("name.test&prompt=create");
  });
});
