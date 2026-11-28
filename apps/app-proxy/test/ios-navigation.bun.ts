import { afterEach, expect, test } from 'bun:test';
import { runInNewContext } from 'node:vm';
import { iosAppNavigation } from '../../shared/ios-app-navigation.mjs';

const original = globalThis.HTMLRewriter;
let script = '';
class Rewrite {
  on(_selector: string, handler: { element(head: { prepend(value: string): void }): void }) {
    handler.element({ prepend(value) { script = value; } });
    return this;
  }
  transform(response: Response) { return response; }
}
afterEach(() => { globalThis.HTMLRewriter = original; });
function inject(path: string, agent: string) {
  globalThis.HTMLRewriter = Rewrite as unknown as typeof HTMLRewriter;
  script = '';
  iosAppNavigation(new Request('https://rocksky.app' + path, { headers: { 'User-Agent': agent } }),
    new Response('<head></head>', {headers: {'Content-Type': 'text/html'}}));
  return script.replace(/^<script>|<\/script>$/g, '');
}
test('public landing, callbacks, assets and API responses bypass mobile navigation', () => {
  for (const path of ['/', '/?login=password', '/?did=alice&__rocksky_app=1', '/atpassport/callback', '/oauth/callback', '/login', '/index.html', '/assets/app.js']) {
    expect(inject(path, 'iPhone')).toBe('');
  }
});
test('iPhone and desktop-mode iPad open the mobile domain with the full link', () => {
  for (const [agent, touches, token, standalone, redirect] of [
    ['iPhone', 1, null, false, true],
    ['Macintosh', 5, null, false, true],
    ['Macintosh', 0, null, false, false],
    ['iPhone', 1, 'existing session', false, false],
    ['iPhone', 1, null, true, false],
  ] as const) {
    for (const path of ['/?__rocksky_app=1', '/did%3Aplc%3Aabc/song/123?q=test#details']) {
      let target = '';
      runInNewContext(inject(path, agent), {
        navigator: { userAgent: agent, maxTouchPoints: touches, standalone },
        localStorage: { getItem: () => token }, URL,
        window: { matchMedia: () => ({matches: false}) },
        location: { href: 'https://rocksky.app' + path, replace: (url: string) => { target = url; } },
      });
      expect(target).toBe(redirect ? 'https://m.rocksky.app' + path : '');
    }
  }
});
