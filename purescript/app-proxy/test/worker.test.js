import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import worker from '../worker.js';

const originalFetch = globalThis.fetch;
const originalRewriter = globalThis.HTMLRewriter;
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalRewriter === undefined) delete globalThis.HTMLRewriter;
  else globalThis.HTMLRewriter = originalRewriter;
});
const call = (path, init = {}, env = {}) => worker.fetch(new Request(`https://rocksky.app${path}`, init), env);

test('preflight selects allowed origins and never fetches an upstream', async () => {
  globalThis.fetch = () => { throw new Error('unexpected upstream'); };
  for (const origin of ['https://rocksky.app', 'https://m.rocksky.app', 'https://other.example']) {
    const response = await call('/uploads/stream', {method: 'OPTIONS', headers: {Origin: origin}});
    assert.equal(response.status, 204);
    assert.equal(response.body, null);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin.includes('other') ? 'https://m.rocksky.app' : origin);
    assert.equal(response.headers.get('Access-Control-Allow-Headers'), 'Content-Type, Authorization, Range');
  }
});

test('serves OAuth metadata, public keys and associations before proxying', async () => {
  globalThis.fetch = () => { throw new Error('unexpected upstream'); };
  const metadata = await (await call('/oauth-client-metadata.json')).json();
  assert.equal(metadata.client_id, 'https://rocksky.app/oauth-client-metadata.json');
  assert.deepEqual(metadata.redirect_uris, ['https://rocksky.app/oauth/callback']);
  assert.equal(metadata.token_endpoint_auth_method, 'private_key_jwt');
  assert.equal(metadata.dpop_bound_access_tokens, true);
  for (const scope of ['repo:app.rocksky.equalizer', 'repo:community.lexicon.calendar.rsvp', 'repo:app.rocksky.rockbox.audio.settings']) {
    assert.ok(metadata.scope.split(' ').includes(scope));
  }
  const jwks = await (await call('/jwks.json')).json();
  assert.equal(jwks.keys.length, 3);
  assert.equal(jwks.keys[0].kid, '2dfa3fd9-57b3-4738-ac27-9e6dadec13b7');
  assert.equal(Object.hasOwn(jwks.keys[2], 'alg'), false);
  assert.equal(jwks.keys.some(key => 'd' in key), false);
  const association = await call('/.well-known/assetlinks.json', {method: 'OPTIONS'});
  assert.equal(association.status, 200);
  for (const team of ['', 'invalid', 'abcdefghij', 'ABCDE123456']) {
    const response = await call('/.well-known/apple-app-site-association', {}, {APPLE_TEAM_ID: team});
    assert.deepEqual((await response.json()).applinks.details, []);
  }
});

test('all API routes preserve queries, credentials and bodies while disabling caches', async () => {
  const paths = ['/login', '/profile', '/token', '/now-playing', '/ws', '/oauth/callback', '/users/alice', '/albums/1', '/artists/1', '/tracks/1', '/scrobbles/1', '/likes/1', '/spotify/play', '/dropbox/oauth/callback', '/googledrive/oauth/callback', '/dropbox/files', '/dropbox/file', '/googledrive/files', '/dropbox/login', '/googledrive/login', '/dropbox/join', '/googledrive/join', '/search', '/public/scrobbles', '/notifications', '/uploads'];
  for (const path of paths) {
    globalThis.fetch = async (request, options) => {
      assert.ok(request instanceof Request);
      assert.equal(request.url, `https://api.rocksky.app${path}?a=1`);
      assert.equal(request.method, 'POST');
      assert.equal(request.headers.get('Authorization'), 'Bearer test');
      assert.equal(request.headers.get('Cookie'), 'session=test');
      assert.equal(await request.text(), 'payload');
      assert.deepEqual(options.cf, {cacheTtl: 0, cacheEverything: false});
      return new Response('api result', {status: 201, headers: {ETag: 'stale', Expires: 'yesterday', 'Set-Cookie': 'session=new'}});
    };
    const response = await call(`${path}?a=1`, {method: 'POST', body: 'payload', headers: {Authorization: 'Bearer test', Cookie: 'session=test', Origin: 'https://rocksky.app'}});
    assert.equal(response.status, 201);
    assert.equal(await response.text(), 'api result');
    assert.equal(response.headers.get('Cache-Control'), 'no-store, no-cache, must-revalidate, max-age=0');
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://rocksky.app');
    assert.equal(response.headers.get('Set-Cookie'), 'session=new');
    assert.equal(response.headers.has('ETag'), false);
    assert.equal(response.headers.has('Expires'), false);
  }
});

test('rockbox assets use desktop deployment on mobile and preserve range requests', async () => {
  globalThis.fetch = async (url, request) => {
    assert.equal(String(url), 'https://rocksky.pages.dev/rockbox/decoder.js?v=2');
    assert.equal(request.headers.get('Range'), 'bytes=0-3');
    return new Response('data', {status: 206, headers: {'Content-Range': 'bytes 0-3/20'}});
  };
  const response = await call('/rockbox/decoder.js?v=2', {headers: {'User-Agent': 'iPhone', Range: 'bytes=0-3'}});
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal(response.headers.get('Content-Range'), 'bytes 0-3/20');
});

test('non-HTML and failed app responses get CORS without an OG request', async () => {
  for (const agent of ['Chrome', 'Android']) {
    let calls = 0;
    globalThis.fetch = async url => {
      calls++;
      assert.equal(String(url), `https://${agent === 'Android' ? 'm.rocksky.app' : 'rocksky.pages.dev'}/assets/file.js`);
      return new Response('missing', {status: 404});
    };
    const response = await call('/assets/file.js', {headers: {'User-Agent': agent}});
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://m.rocksky.app');
    assert.equal(calls, 1);
  }
});

test('rewrites social metadata with escaping and defaults for both app deployments', async () => {
  for (const agent of ['Chrome', 'iPhone']) {
    const selectors = [];
    let tags;
    globalThis.HTMLRewriter = class {
      on(selector, handler) {
        selectors.push(selector);
        if (selector === 'head') handler.element({append: (value, options) => {
          tags = value;
          assert.deepEqual(options, {html: true});
        }});
        else handler.element({remove: () => {}});
        return this;
      }
      transform(response) { return response; }
    };
    globalThis.fetch = async url => {
      if (String(url).startsWith('https://api.rocksky.app/public/og?')) {
        assert.equal(new URL(url).searchParams.get('path'), '/did%3Aplc%3Aabc/song/123');
        return Response.json({title: '<hello> & "world"', description: 'a & b', image: 'https://img.example/a?x=1&y=2'});
      }
      assert.equal(String(url), `https://${agent === 'iPhone' ? 'm.rocksky.app' : 'rocksky.pages.dev'}/did%3Aplc%3Aabc/song/123?x=1`);
      return new Response('<html><head></head></html>', {headers: {'Content-Type': 'text/html', 'X-Origin': 'preserved'}});
    };
    const response = await call('/did%3Aplc%3Aabc/song/123?x=1', {headers: {'User-Agent': agent}});
    assert.deepEqual(selectors, ['meta[property^="og:"]', 'meta[name^="twitter:"]', 'head']);
    assert.ok(tags.includes('<title>&lt;hello&gt; &amp; &quot;world&quot;</title>'));
    assert.ok(tags.includes('property="og:type" content="website"'));
    assert.ok(tags.includes('name="twitter:card" content="summary_large_image"'));
    assert.ok(tags.includes('property="og:url" content="https://rocksky.app/did%3Aplc%3Aabc/song/123?x=1"'));
    assert.equal(response.headers.get('Cache-Control'), 'public, max-age=300');
    assert.equal(response.headers.get('X-Origin'), 'preserved');
  }
});

test('homepage outages produce an uncached error, including bodyless HEAD', async () => {
  globalThis.fetch = async () => { throw new Error('offline'); };
  for (const method of ['GET', 'HEAD']) {
    const response = await call('/', {method});
    assert.equal(response.status, 502);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    if (method === 'HEAD') assert.equal(response.body, null);
    else assert.match(await response.text(), /temporarily unavailable/);
  }
});
