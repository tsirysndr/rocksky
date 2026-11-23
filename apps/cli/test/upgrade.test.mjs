import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  upgrade,
  releaseAsset,
  latestRelease,
  compareVersions,
} from "../src/cmd/upgrade.mjs";
const content = Buffer.alloc(4096, 7);
const digest = createHash("sha256").update(content).digest("hex");
const asset = "rocksky-linux-x86_64";
const release = {
  tag_name: "rocksky-cli-v0.11.5",
  draft: false,
  prerelease: false,
  assets: [
    { name: asset, size: content.length },
    { name: asset + ".sha256", size: 100 },
  ],
};
async function fixture(
  run,
  { checksum = digest, body = content, requestFailure = false } = {},
) {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "rocksky-upgrade-test-"),
  );
  const binary = path.join(directory, "rocksky");
  await fs.writeFile(binary, "old executable", { mode: 0o755 });
  const calls = [],
    lines = [];
  const runtime = {
    binaryPath: binary,
    platform: "linux",
    arch: "x64",
    output: { isTTY: false, write: (text) => lines.push(text) },
    fetch: async (url, options) => {
      calls.push(String(url));
      if (String(url).startsWith("https://api.github.com/"))
        return Response.json([release]);
      if (String(url).endsWith(".sha256"))
        return new Response(checksum + "  " + asset + "\n");
      if (requestFailure) throw new Error("offline");
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(body.subarray(0, 1000));
            controller.enqueue(body.subarray(1000));
            controller.close();
          },
        }),
      );
    },
  };
  try {
    await run({ directory, binary, runtime, calls, lines });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}
test("streams a verified binary, displays percentage and size, and atomically replaces a symlink target", async () => {
  await fixture(async ({ directory, binary, runtime, lines }) => {
    const link = path.join(directory, "linked-rocksky");
    await fs.symlink(binary, link);
    await upgrade({ output: link }, { currentVersion: "0.11.4" }, runtime);
    assert.deepEqual(await fs.readFile(binary), content);
    assert.equal(await fs.readlink(link), binary);
    assert.match(lines.join(""), /0\.0%\s+0 B \/ 4\.0 KiB/);
    assert.match(lines.join(""), /100\.0%\s+4\.0 KiB \/ 4\.0 KiB/);
    assert.match(lines.join(""), /Installed Rocksky CLI 0\.11\.5/);
    assert.equal((await fs.stat(binary)).mode & 0o777, 0o755);
    assert.deepEqual((await fs.readdir(directory)).sort(), [
      "linked-rocksky",
      "rocksky",
    ]);
  });
});
for (const [name, options, pattern] of [
  ["bad checksum", { checksum: "0".repeat(64) }, /checksum mismatch/],
  [
    "truncated download",
    { body: content.subarray(0, 2000) },
    /Incomplete binary/,
  ],
  ["oversized download", { body: Buffer.alloc(5000) }, /exceeded/],
  ["network failure", { requestFailure: true }, /offline/],
])
  test(`${name} preserves installed binary and removes staging files`, async () => {
    await fixture(async ({ directory, binary, runtime }) => {
      await assert.rejects(
        upgrade({}, { currentVersion: "0.11.4" }, runtime),
        pattern,
      );
      assert.equal(await fs.readFile(binary, "utf8"), "old executable");
      assert.deepEqual(await fs.readdir(directory), ["rocksky"]);
    }, options);
  });
test("check-only and up-to-date runs never download or modify files", async () => {
  await fixture(async ({ binary, runtime, calls }) => {
    await upgrade({ check: true }, { currentVersion: "0.11.4" }, runtime);
    await upgrade({}, { currentVersion: "0.11.5" }, runtime);
    assert.equal(calls.length, 2);
    assert.ok(calls.every((url) => url.startsWith("https://api.github.com/")));
    assert.equal(await fs.readFile(binary, "utf8"), "old executable");
  });
});
test("npm invocation cannot replace Node; an explicit output supports standalone installation", async () => {
  await fixture(async ({ binary, runtime, calls, directory }) => {
    const nodeRuntime = { ...runtime, binaryPath: undefined };
    await assert.rejects(
      upgrade({}, { currentVersion: "0.11.4" }, nodeRuntime),
      /Node\/Bun package installation/,
    );
    assert.equal(calls.length, 1);
    const output = path.join(directory, "installed");
    await upgrade({ output }, { currentVersion: "0.11.4" }, nodeRuntime);
    assert.deepEqual(await fs.readFile(output), content);
    assert.equal(await fs.readFile(binary, "utf8"), "old executable");
  });
});
test("selects CLI releases numerically and ignores other products, drafts and prereleases", async () => {
  const selected = await latestRelease(async () =>
    Response.json([
      { ...release, tag_name: "playerd-99.0.0" },
      { ...release, tag_name: "rocksky-cli-v9.0.0", draft: true },
      { ...release, tag_name: "rocksky-cli-v8.0.0", prerelease: true },
      { ...release, tag_name: "rocksky-cli-v0.9.99" },
      { ...release, tag_name: "rocksky-cli-v0.11.10" },
      { ...release, tag_name: "rocksky-cli-v0.11.9" },
    ]),
  );
  assert.equal(selected.tag_name, "rocksky-cli-v0.11.10");
  assert.ok(compareVersions("0.11.10", "0.11.9") > 0);
  assert.equal(
    releaseAsset("darwin", "arm64", "purescript"),
    "rocksky-purescript-darwin-aarch64",
  );
  assert.throws(
    () => releaseAsset("darwin", "x64", "typescript"),
    /macOS aarch64/,
  );
  await assert.rejects(
    latestRelease(async () => new Response(null, { status: 503 })),
    /HTTP 503/,
  );
});
test("explicit version uses the corresponding release and malformed checksums are rejected", async () => {
  const selected = await latestRelease(async (url) => {
    assert.ok(String(url).endsWith("/tags/rocksky-cli-v0.11.5"));
    return Response.json(release);
  }, "v0.11.5");
  assert.equal(selected.tag_name, release.tag_name);
  await assert.rejects(
    latestRelease(async () => {
      throw Error("must not fetch");
    }, "../bad"),
    /Expected a version/,
  );
  await fixture(async ({ runtime, binary }) => {
    const fetcher = runtime.fetch;
    runtime.fetch = async (url, opts) =>
      String(url).endsWith(".sha256")
        ? new Response(digest + "  another-file\n")
        : fetcher(url, opts);
    await assert.rejects(
      upgrade({}, { currentVersion: "0.11.4" }, runtime),
      /Invalid release checksum/,
    );
    assert.equal(await fs.readFile(binary, "utf8"), "old executable");
  });
});
