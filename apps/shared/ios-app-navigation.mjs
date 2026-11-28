// The same Worker can serve landing, auth, API, and app HTML. Only mobile
// app destinations belong here. Keep the public homepage on its own origin.
const appPath = /^\/(?:charts|analytics|explore|notifications|wrapped|me|apikeys|access-tokens|storage|mirrors|shout-editor|tos|privacy|library(?:\/upload|\/(?:album|artist|playlist)\/[^/]+)?|profile\/[^/]+|[^/]+\/(?:album|artist|song|scrobble)\/[^/]+)\/?$/;

// Run before the app boots. Desktop-mode iPad Safari shares the Mac user
// agent, and only the browser can check touch support and origin-local login.
export function openMobileApp() {
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  if (!ios || navigator.standalone || window.matchMedia('(display-mode: standalone)').matches) return;
  try {
    if (localStorage.getItem('token')) return;
    const url = new URL(location.href);
    if (url.hostname !== 'rocksky.app' || /(?:^#|[?&])(?:access_token|token|code|state)=/i.test(url.hash)) return;
    url.hostname = 'm.rocksky.app';
    location.replace(url.href);
  } catch {
    // Restricted storage can hide an existing session. Keep it on this origin.
  }
}

export function iosAppNavigation(request, response) {
  if (request.method !== 'GET' || response.status !== 200 ||
      !response.headers.get('content-type')?.includes('text/html')) return response;
  const url = new URL(request.url);
  if (url.hostname !== 'rocksky.app') return response;
  const explicitApp = url.pathname === '/' && url.searchParams.get('__rocksky_app') === '1';
  if (!explicitApp && !appPath.test(url.pathname)) return response;
  if (['did', 'cli', 'session', 'code', 'state', 'token', 'access_token'].some(key => url.searchParams.has(key))) return response;
  if (!/iPhone|iPad|iPod|Macintosh/i.test(request.headers.get('user-agent') ?? '')) return response;
  const headers = new Headers(response.headers);
  for (const name of ['ETag', 'Content-Length', 'Last-Modified']) headers.delete(name);
  headers.set('Cache-Control', 'private, no-store');
  return new HTMLRewriter().on('head', {
    element(head) {
      head.prepend('<script>(' + openMobileApp.toString() + ')()</script>', { html: true });
    },
  }).transform(new Response(response.body, { headers }));
}
