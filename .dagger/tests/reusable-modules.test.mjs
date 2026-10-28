// Compile artifacts, github-release, eas, android-sdk and ops with Spago first.
// These tests inspect graphs and mock API responses; they never start Dagger.
import nodeTest from 'node:test';
const test = (name, fn) => nodeTest(name, { timeout: 15000 }, fn);
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

async function harness(t, name, reply = () => 'fixture-id') {
  const base = new URL(`../${name}/output/`, import.meta.url);
  const load = name => import(new URL(`${name}/index.js`, base));
  const [main, aff, either, dagger, query, directory, container] = await Promise.all(
    ['Main', 'Effect.Aff', 'Data.Either', 'Dagger', 'Dagger.Query', 'Dagger.Directory', 'Dagger.Container'].map(load));
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const request = JSON.parse(body);
    requests.push(request);
    const fields = request.query.replace(/\([^)]*\)/g, '').replace(/\.\.\. on \w+/g, '').match(/\b\w+\b/g).slice(1);
    try {
      const value = reply(fields.at(-1), request);
      const data = fields.reduceRight((value, field) => ({ [field]: value }), value);
      res.end(JSON.stringify({ data }));
    } catch (error) {
      res.end(JSON.stringify({ errors: [{ message: error.message }] }));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const client = dagger.connectWith({ port: server.address().port, token: 'test', timeoutMs: 3000 })();
  const run = value => new Promise((resolve, reject) => aff.runAff(result => () =>
    result instanceof either.Left ? reject(result.value0) : resolve(result.value0))(value)());
  return { main, client, run, requests, query, directory, container, load };
}

const values = requests => requests.flatMap(request => Object.values(request.variables));
const commands = requests => values(requests).filter(Array.isArray);

test('archive rejects traversal and packages a normalized tar with a sidecar', async t => {
  const h = await harness(t, 'artifacts', leaf => leaf === 'entries' ? ['app.tar.gz'] : 'fixture-id');
  const source = h.query.directory(h.client);
  await assert.rejects(h.run(h.main.archive(h.client)({ source, name: '../escape' })), /basename/);
  assert.equal(h.requests.length, 0);
  const result = await h.run(h.main.archive(h.client)({ source, name: 'app' }));
  await h.run(h.directory.id(result));
  const all = commands(h.requests);
  assert(all.some(cmd => cmd[0] === 'tar' && cmd.includes('--mtime=@0') && cmd.includes('--sort=name')));
  assert(all.some(cmd => cmd.join(' ') === 'sha256sum -- app.tar.gz'));
  assert(values(h.requests).includes('app.tar.gz.sha256'));
});

test('ensure preserves an existing release and propagates API failures', async t => {
  let fail = false;
  const h = await harness(t, 'github-release', leaf => {
    if (leaf === 'stdout') { if (fail) throw new Error('authentication failed'); return 'v1\nv2\n'; }
    return 'fixture-id';
  });
  const args = { repository: 'example/project', tag: 'v2', commit: 'abc', title: 'Release', notes: '', prerelease: false, token: h.query.setSecret('test')('fake')(h.client), runId: 'attempt-1' };
  await h.run(h.main.ensure(h.client)(args));
  assert(!commands(h.requests).some(cmd => cmd.includes('create')));
  fail = true;
  await assert.rejects(h.run(h.main.ensure(h.client)(args)), /authentication failed/);
  assert(!commands(h.requests).some(cmd => cmd.includes('create')));
});

test('ensure creates an absent release with explicit repository and metadata', async t => {
  const h = await harness(t, 'github-release', leaf => leaf === 'stdout' ? 'v1\n' : 'fixture-id');
  await h.run(h.main.ensure(h.client)({ repository: 'example/project', tag: 'v2', commit: 'abc', title: 'Release', notes: 'Notes', prerelease: true, token: h.query.setSecret('test')('fake')(h.client), runId: 'attempt-2' }));
  assert(commands(h.requests).some(cmd => cmd.includes('create') && cmd.includes('--prerelease') && cmd.includes('abc')));
  assert(values(h.requests).includes('example/project'));
});

test('upload rejects empty assets and label syntax before publishing', async t => {
  let files = [];
  const h = await harness(t, 'github-release', leaf => leaf === 'entries' ? files : 'fixture-id');
  const args = { assets: h.query.directory(h.client), repository: 'example/project', tag: 'v1', token: h.query.setSecret('test')('fake')(h.client), runId: 'attempt-1', clobber: false };
  await assert.rejects(h.run(h.main.upload(h.client)(args)), /No release assets/);
  files = ['file#label'];
  await assert.rejects(h.run(h.main.upload(h.client)(args)), /cannot contain/);
  assert(!commands(h.requests).some(cmd => cmd.includes('upload')));
});

test('EAS validates paths and detects profiles producing the wrong format', async t => {
  let listing = 'AndroidManifest.xml\nclasses.dex\n';
  const h = await harness(t, 'eas', leaf => leaf === 'stdout' ? listing : 'fixture-id');
  const args = { builder: h.query.container(h.client), source: h.query.directory(h.client), projectDir: '../outside', profile: 'production', token: h.query.setSecret('test')('fake')(h.client), runId: 'attempt-1' };
  await assert.rejects(h.run(h.main.build('aab')(h.client)(args)), /relative path/);
  assert.equal(h.requests.length, 0);
  args.projectDir = 'apps/mobile';
  await assert.rejects(h.run(h.main.build('aab')(h.client)(args)), /did not produce an aab/);
  listing = 'BundleConfig.pb\nbase/manifest/AndroidManifest.xml\n';
  await h.run(h.main.build('aab')(h.client)(args));
  assert(commands(h.requests).some(cmd => cmd[0] === 'eas' && cmd.includes('--local') && cmd.includes('--non-interactive')));
  assert(!JSON.stringify(h.requests).includes('eas submit'));
});

test('Android SDK graph pins amd64, verifies the download and installs selected packages', async t => {
  const h = await harness(t, 'android-sdk');
  const result = await h.run(h.main.sdk(h.client)({ jdkImage: 'eclipse-temurin:21-jdk-noble', commandToolsVersion: '15859902', commandToolsSha256: 'a'.repeat(64), platform: '36', buildTools: '36.0.0', ndk: '27.1.12297006', cmake: '3.22.1' }));
  await h.run(h.container.id(result));
  assert(values(h.requests).includes('linux/amd64'));
  assert(commands(h.requests).some(cmd => cmd.join(' ') === 'sha256sum --check -'));
  assert(commands(h.requests).some(cmd => cmd[0] === 'sdkmanager' && cmd.includes('ndk;27.1.12297006') && cmd.includes('platforms;android-36')));
});

test('Rocksky adapters use the extracted modules and preserve release names', async t => {
  const h = await harness(t, 'ops');
  const releases = await h.load('ReleaseClients');
  await h.run(releases.upload(h.client)({ assets: h.query.directory(h.client), tag: 'playerd-1.0', token: h.query.setSecret('test')('fake')(h.client), runId: 'attempt-1' }));
  assert(h.requests.some(r => r.query.includes('githubRelease') && r.query.includes('upload')));
  assert(values(h.requests).includes('tsirysndr/rocksky'));
  const output = await h.run(h.main.packageRelease(h.client)({ binary: h.directory.file('playerd')(h.query.directory(h.client)), project: 'playerd', tag: 'playerd-1.0', target: 'x86_64-unknown-linux-gnu' }));
  await h.run(h.directory.id(output));
  assert(h.requests.some(r => r.query.includes('releaseArtifacts')));
  assert(values(h.requests).includes('playerd-1.0-x86_64-unknown-linux-gnu'));
});


test('EAS CI entrypoint composes the SDK and toolchain with the selected profile', async t => {
  const h = await harness(t, 'eas', leaf => leaf === 'stdout' ? 'AndroidManifest.xml\nclasses.dex\n' : 'fixture-id');
  await h.run(h.main.android(h.client)({ source: h.query.directory(h.client), projectDir: 'apps/app', profile: '', format: 'apk', token: h.query.setSecret('test')('fake')(h.client), runId: 'attempt-2', easVersion: '16.28.0' }));
  assert(h.requests.some(r => r.query.includes('androidSdk')));
  assert(commands(h.requests).some(cmd => cmd.includes('eas-cli@16.28.0')));
  assert(commands(h.requests).some(cmd => cmd[0] === 'eas' && cmd.includes('apk')));
});
