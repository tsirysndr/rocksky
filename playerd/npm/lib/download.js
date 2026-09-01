// Fetch the playerd binary for this platform from the GitHub release that
// matches the package version, verify its SHA-256, and unpack it next to the
// bin shim. Used twice: by the postinstall script, and lazily by the shim as a
// fallback when installs ran with --ignore-scripts.
//
// The version is pinned to package.json — no "latest" lookup at install time,
// so an install is reproducible and a republished release can't change what an
// existing package version fetches.

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const REPO = "tsirysndr/rocksky";

/** Where the downloaded binary lives (inside the installed package). */
const binaryPath = path.join(__dirname, "..", "bin", "playerd-bin");

/** The release target triple for this machine, or an explanatory error. */
function resolveTarget() {
  const platform = os.platform();
  const arch = os.arch();
  if (platform === "darwin" && arch === "arm64") return "aarch64-apple-darwin";
  if (platform === "linux" && arch === "x64") return "x86_64-unknown-linux-gnu";
  if (platform === "linux" && arch === "arm64") return "aarch64-unknown-linux-gnu";
  const hint =
    platform === "darwin" && arch === "x64"
      ? "no macOS Intel build is published — build from source: cargo install --git https://github.com/tsirysndr/rocksky playerd"
      : `playerd releases cover macOS arm64 and Linux x64/arm64, not ${platform}/${arch}`;
  throw new Error(`unsupported platform: ${hint}`);
}

async function fetchBytes(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Download + verify + unpack. Idempotent: returns fast when already there. */
async function ensureBinary() {
  if (fs.existsSync(binaryPath)) return binaryPath;

  const version = require("../package.json").version;
  const tag = `playerd-v${version}`;
  const target = resolveTarget();
  const asset = `playerd-v${version}-${target}.tar.gz`;
  const base = `https://github.com/${REPO}/releases/download/${tag}`;

  console.error(`downloading playerd ${version} (${target}) from github.com/${REPO}…`);
  const tarball = await fetchBytes(`${base}/${asset}`);

  // The release publishes `<sha256>  <asset>` alongside every tarball.
  const sumLine = (await fetchBytes(`${base}/${asset}.sha256`)).toString("utf8");
  const expected = sumLine.trim().split(/\s+/)[0];
  const actual = crypto.createHash("sha256").update(tarball).digest("hex");
  if (!expected || expected !== actual) {
    throw new Error(`checksum mismatch for ${asset}: expected ${expected}, got ${actual}`);
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "playerd-npm-"));
  try {
    const tarPath = path.join(tmp, asset);
    fs.writeFileSync(tarPath, tarball);
    // Every supported platform (macOS, Linux) ships tar; avoids a JS tar dep.
    const out = spawnSync("tar", ["-xzf", tarPath, "-C", tmp, "playerd"], {
      stdio: ["ignore", "ignore", "inherit"],
    });
    if (out.status !== 0) throw new Error(`tar extraction failed for ${asset}`);
    fs.mkdirSync(path.dirname(binaryPath), { recursive: true });
    fs.copyFileSync(path.join(tmp, "playerd"), binaryPath);
    fs.chmodSync(binaryPath, 0o755);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return binaryPath;
}

module.exports = { binaryPath, ensureBinary };
