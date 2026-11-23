import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Ok } from '../build/dev/javascript/rocksky_api/gleam.mjs';
import { None } from '../build/dev/javascript/gleam_stdlib/gleam/option.mjs';
import { to_string } from '../build/dev/javascript/gleam_json/gleam/json.mjs';
import { parse } from '../build/dev/javascript/rocksky_api/rocksky_api/lib/track.mjs';
import { event } from '../build/dev/javascript/rocksky_api/rocksky_api/lib/scrobble_status.mjs';

test('Android scrobbles infer playback only inside the original playback window', () => {
  const now = 1_800_000_000_000;
  const input = { title: 'Song', artist: 'Artist', album: 'Album', albumArtist: 'Artist', timestamp: now / 1000 - 100, duration: 200_000 };
  const convert = data => { const r = parse(data); assert.ok(r instanceof Ok); return r[0]; };
  const result = JSON.parse(to_string(event('did:plc:android', convert(input), now)[0]));
  assert.equal(result.did, 'did:plc:android');
  assert.equal(result.track.started_at, now - 100_000);
  assert.equal(result.track.duration_ms, 200_000);
  assert.equal(result.track.source, 'scrobble');
  for (const change of [{timestamp: now / 1000 - 201}, {timestamp: now / 1000 - 200}, {timestamp: now / 1000 + 1}, {timestamp: undefined}, {duration: 0}]) {
    assert.ok(event('did:plc:android', convert({...input, ...change}), now) instanceof None);
  }
});
