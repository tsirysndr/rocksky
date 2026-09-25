import { afterEach, expect, mock, test } from "bun:test";
import { requestAtPassportHandle } from "../src/atpassport";

const saved = new Map(
  ["window", "navigator", "document"].map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
  ]),
);
afterEach(() => {
  for (const [key, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

function browser(
  get: (options: unknown) => Promise<unknown>,
  supported = true,
  allowed = true,
) {
  Object.defineProperties(globalThis, {
    window: {
      configurable: true,
      value: {
        location: { origin: "https://rocksky.app" },
        ...(supported ? { IdentityCredential: class {} } : {}),
      },
    },
    navigator: { configurable: true, value: { credentials: { get } } },
    document: {
      configurable: true,
      value: { permissionsPolicy: { allowsFeature: () => allowed } },
    },
  });
}

test("opens the native chooser in active mode and returns only a handle", async () => {
  const get = mock(async (options: unknown) => {
    expect(options).toEqual({
      identity: {
        context: "use",
        mode: "active",
        providers: [
          {
            configURL: "https://atpassport.net/fedcm/config.json",
            clientId: "https://rocksky.app",
            fields: ["username", "picture"],
          },
        ],
      },
    });
    return {
      token: JSON.stringify({
        v: 1,
        did: "did:plc:untrusted",
        username: "Alice.Bsky.Social",
      }),
    };
  });
  browser(get);
  const fallback = mock(() => {});
  expect(await requestAtPassportHandle(fallback)).toBe("alice.bsky.social");
  expect(get).toHaveBeenCalledTimes(1);
  expect(fallback).not.toHaveBeenCalled();
});

test("unsupported browsers and denied permissions use the existing redirect flow", async () => {
  for (const [supported, allowed] of [
    [false, true],
    [true, false],
  ]) {
    const get = mock(async () => null);
    browser(get, supported, allowed);
    const fallback = mock(() => {});
    expect(await requestAtPassportHandle(fallback)).toBeNull();
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(get).not.toHaveBeenCalled();
  }
});

test("closing or cancelling the native chooser never redirects", async () => {
  for (const name of ["NotAllowedError", "AbortError", "null"]) {
    browser(async () => {
      if (name === "null") return null;
      throw new DOMException("Dismissed", name);
    });
    const fallback = mock(() => {});
    expect(await requestAtPassportHandle(fallback)).toBeNull();
    expect(fallback).not.toHaveBeenCalled();
  }
});

test("provider network errors fall back to redirect", async () => {
  browser(async () => {
    throw new DOMException("Unavailable", "NetworkError");
  });
  const fallback = mock(() => {});
  expect(await requestAtPassportHandle(fallback)).toBeNull();
  expect(fallback).toHaveBeenCalledTimes(1);
});

test("invalid native payloads cannot start OAuth", async () => {
  browser(async () => ({
    token: JSON.stringify({
      v: 1,
      did: "did:plc:abc",
      username: "https://evil.example",
    }),
  }));
  const fallback = mock(() => {});
  expect(await requestAtPassportHandle(fallback)).toBeNull();
  expect(fallback).not.toHaveBeenCalled();
});
