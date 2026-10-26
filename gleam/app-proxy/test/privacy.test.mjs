// Regression cases ported from apps/app-proxy/test.
import { describe, expect, test } from "./harness.mjs";
import worker from "./adapter.mjs";
const call = (url, init) => worker.fetch(new Request(url, init), {}, {});
describe("privacy routing", () => {
  test("/privacy is served by the app, never redirected", async () => {
    const originalFetch = globalThis.fetch;
    let target = "";
    globalThis.fetch = async (input) => {
      const requested = String(input);
      if (requested.includes("/public/og"))
        return new Response("missing", { status: 404 });
      target = requested;
      return new Response("<html></html>", { headers: { "Content-Type": "text/html" } });
    };
    try {
      const response = await call("https://rocksky.app/privacy");
      expect(response.status).toBe(200);
      expect(target).toContain("/privacy");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
  test("redirects the alternate /privacy-policy spelling to /privacy", async () => {
    const response = await call("https://rocksky.app/privacy-policy");
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("https://rocksky.app/privacy");
  });
  test("keeps the query string on that redirect", async () => {
    const response = await call("https://rocksky.app/privacy-policy?from=play");
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("https://rocksky.app/privacy?from=play");
  });
  test("redirects before user-agent routing, so mobile gets it too", async () => {
    const response = await call("https://rocksky.app/privacy-policy", {
      headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" }
    });
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("https://rocksky.app/privacy");
  });
});
