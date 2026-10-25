// Regression cases ported from apps/app-proxy/test.
import { afterEach, expect, mock, test } from "./harness.js";
import worker from "./adapter.js";
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
test("keeps encoded scrobble links in the app for guests and signed-in visitors", async () => {
  const path = "/did%3Aplc%3A4ogq4k7a6bzpqabiwnleelq4/scrobble/3mwgvxu5dys22";
  for (const cookie of ["", "rocksky_session_hint=1"]) {
    for (const agent of ["Chrome", "Android Chrome"]) {
      const appOrigin = agent.includes("Android") ? "https://m.rocksky.app" : "https://rocksky.pages.dev";
      const requested = [];
      globalThis.fetch = mock(async (input) => {
        const url = String(input);
        requested.push(url);
        if (url === `${appOrigin}${path}`) {
          return new Response("<html>app shell</html>", { headers: { "Content-Type": "text/html" } });
        }
        if (url.startsWith("https://api.rocksky.app/public/og?")) {
          return new Response(null, { status: 404 });
        }
        throw new Error(`Unexpected upstream: ${url}`);
      });
      const response = await worker.fetch(new Request(`https://rocksky.app${path}`, { headers: { Cookie: cookie, "User-Agent": agent } }), {}, {});
      expect(response.status).toBe(200);
      expect(response.headers.has("Location")).toBe(false);
      expect(await response.text()).toBe("<html>app shell</html>");
      expect(requested[0]).toBe(`${appOrigin}${path}`);
      expect(requested).toHaveLength(2);
    }
  }
});
