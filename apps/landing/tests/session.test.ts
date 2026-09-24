import { afterEach, expect, test } from "bun:test";
import {
  clearSessionToken,
  storeSessionToken,
  syncHomepageSession,
} from "../../shared/browser-session";

const saved = new Map(
  ["document", "location", "localStorage"].map((key) => [
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
  token: string | null,
  cookie = "",
  href = "https://rocksky.app/",
) {
  const values = new Map<string, string>(
    token === null ? [] : [["token", token]],
  );
  let currentCookie = cookie;
  let target = "";
  const url = new URL(href);
  Object.defineProperties(globalThis, {
    document: {
      configurable: true,
      value: {
        get cookie() {
          return currentCookie;
        },
        set cookie(value: string) {
          currentCookie = value.includes("Max-Age=0")
            ? ""
            : value.split(";")[0];
        },
      },
    },
    location: {
      configurable: true,
      value: {
        href,
        protocol: url.protocol,
        replace(value: string) {
          target = value;
        },
      },
    },
    localStorage: {
      configurable: true,
      value: {
        getItem(key: string) {
          return values.get(key) ?? null;
        },
        setItem(key: string, value: string) {
          values.set(key, value);
        },
        removeItem(key: string) {
          values.delete(key);
        },
      },
    },
  });
  return { values, cookie: () => currentCookie, target: () => target };
}
test("existing sessions migrate from landing to the app without exposing the token", () => {
  const state = browser("private-token");
  expect(syncHomepageSession("landing")).toBe(true);
  expect(state.cookie()).toBe("rocksky_session_hint=1");
  expect(state.target()).toBe("https://rocksky.app/?__rocksky_app=1");
});
test("login writes the hint and logout removes it before navigation", () => {
  const state = browser(null);
  storeSessionToken("private-token");
  expect(state.values.get("token")).toBe("private-token");
  expect(state.cookie()).toBe("rocksky_session_hint=1");
  clearSessionToken();
  expect(state.values.has("token")).toBe(false);
  expect(state.cookie()).toBe("");
  expect(() => storeSessionToken(undefined)).toThrow();
});
test("stale hints are cleared once and do not cause rollout loops", () => {
  const state = browser(null, "rocksky_session_hint=1");
  expect(syncHomepageSession("app")).toBe(true);
  expect(state.cookie()).toBe("");
  expect(syncHomepageSession("app")).toBe(false);
});
test("auth handoffs, direct deployments and deep links do not redirect", () => {
  for (const href of [
    "https://rocksky.app/?did=abc",
    "https://rocksky.app/?cli=1",
    "https://rocksky.app/?session=expired",
    "https://rocksky.app/?__rocksky_app=1",
    "https://rocksky.app/@alice",
    "https://rocksky.pages.dev/",
  ]) {
    const state = browser(null, "rocksky_session_hint=1", href);
    expect(syncHomepageSession("app")).toBe(false);
    expect(state.target()).toBe("");
  }
  const state = browser("token", "", "https://rocksky-landing.pages.dev/");
  expect(syncHomepageSession("landing")).toBe(false);
  expect(state.target()).toBe("");
});
