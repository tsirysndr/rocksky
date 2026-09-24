import { afterEach, expect, mock, test } from "bun:test";
import { passwordSignIn } from "../src/auth";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("password login matches the existing API contract without putting credentials in the URL", async () => {
  globalThis.fetch = mock(async (url: unknown, options?: RequestInit) => {
    expect(String(url)).toBe("https://api.rocksky.app/login");
    expect(options?.method).toBe("POST");
    expect(JSON.parse(options?.body as string)).toEqual({
      handle: "listener.bsky.social",
      password: " secret ",
    });
    expect(options?.redirect).toBe("error");
    expect(options?.cache).toBe("no-store");
    return new Response("jwt:header.payload.signature");
  }) as unknown as typeof fetch;
  expect(
    await passwordSignIn(
      "https://api.rocksky.app/",
      " @Listener.Bsky.Social ",
      " secret ",
    ),
  ).toBe("header.payload.signature");
});

test("failed logins and malformed success responses never become sessions", async () => {
  for (const response of [
    new Response("private error details", { status: 401 }),
    new Response("jwt:"),
    new Response("<html>redirect</html>"),
    new Response("jwt:undefined"),
  ]) {
    globalThis.fetch = mock(async () => response) as unknown as typeof fetch;
    await expect(
      passwordSignIn(
        "https://api.rocksky.app",
        "listener.bsky.social",
        "password",
      ),
    ).rejects.toThrow();
  }
});

test("network failures and rate limits have actionable messages", async () => {
  globalThis.fetch = mock(async () => {
    throw new Error("network");
  }) as unknown as typeof fetch;
  await expect(
    passwordSignIn(
      "https://api.rocksky.app",
      "listener.bsky.social",
      "password",
    ),
  ).rejects.toThrow("Check your connection");
  globalThis.fetch = mock(
    async () => new Response(null, { status: 429 }),
  ) as unknown as typeof fetch;
  await expect(
    passwordSignIn(
      "https://api.rocksky.app",
      "listener.bsky.social",
      "password",
    ),
  ).rejects.toThrow("Too many sign-in attempts");
});
