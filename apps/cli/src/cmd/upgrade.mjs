import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const API = "https://api.github.com/repos/tsirysndr/rocksky/releases";
const DOWNLOAD = "https://github.com/tsirysndr/rocksky/releases/download";
const TAG = /^rocksky-cli-v(\d+)\.(\d+)\.(\d+)$/;
const binaryMarker = Symbol.for("rocksky.cli.binary");

export function compareVersions(a, b) {
  const parts = (value) =>
    value
      .replace(/^rocksky-cli-v|^v/, "")
      .split(".")
      .map(Number);
  const left = parts(a),
    right = parts(b);
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  }
  return 0;
}
export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB"];
  let size = bytes / 1024,
    index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index++;
  }
  return `${size.toFixed(1)} ${units[index]}`;
}
export function releaseAsset(platform, arch, variant) {
  if (
    !["linux", "darwin"].includes(platform) ||
    !["x64", "arm64"].includes(arch) ||
    (platform === "darwin" && arch === "x64")
  )
    throw new Error(
      "Standalone releases support Linux x86_64/aarch64 and macOS aarch64.",
    );
  return `${variant === "purescript" ? "rocksky-purescript" : "rocksky"}-${platform}-${arch === "x64" ? "x86_64" : "aarch64"}`;
}
function progress(output, version) {
  let last = 0;
  const color = output.isTTY && !process.env.NO_COLOR;
  return (received, total, done = false) => {
    const now = Date.now();
    if (received !== 0 && !done && now - last < (output.isTTY ? 100 : 1000))
      return;
    last = now;
    const percent = Math.min(100, (received / total) * 100);
    const filled = Math.floor(percent / 5);
    const line = `Downloading ${version} [${"=".repeat(filled)}${" ".repeat(20 - filled)}] ${percent.toFixed(1)}%  ${formatSize(received)} / ${formatSize(total)}`;
    output.write(
      `${output.isTTY ? "\r\x1b[2K" : ""}${color ? "\x1b[38;2;243;166;208m" : ""}${line}${color ? "\x1b[0m" : ""}${done || !output.isTTY ? "\n" : ""}`,
    );
  };
}
async function json(fetcher, url) {
  const response = await fetcher(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "rocksky-cli",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok)
    throw new Error(`GitHub release check failed (HTTP ${response.status}).`);
  return response.json();
}
export async function latestRelease(fetcher, version) {
  if (version) {
    const tag = version.startsWith("rocksky-cli-v")
      ? version
      : `rocksky-cli-v${version.replace(/^v/, "")}`;
    if (!TAG.test(tag)) throw new Error("Expected a version such as 0.11.4.");
    const release = await json(fetcher, `${API}/tags/${tag}`);
    if (release.tag_name !== tag || release.draft || release.prerelease)
      throw new Error(
        "Requested CLI release is not a published stable release.",
      );
    return release;
  }
  // Other products publish in this repository, so /releases/latest is not
  // necessarily a CLI release. Ignore drafts and prereleases as well.
  for (let page = 1; page <= 10; page++) {
    const releases = await json(fetcher, `${API}?per_page=100&page=${page}`);
    if (!Array.isArray(releases))
      throw new Error("Invalid GitHub release response.");
    const candidates = releases.filter(
      (r) => TAG.test(r.tag_name) && !r.draft && !r.prerelease,
    );
    if (candidates.length)
      return candidates.sort((a, b) =>
        compareVersions(b.tag_name, a.tag_name),
      )[0];
    if (releases.length < 100) break;
  }
  throw new Error("No published Rocksky CLI binary release was found.");
}

/** Filesystem/network adapter shared by the CLI frontends. Only the compiled
 * entry marks its executable as replaceable; Node/Bun themselves are never a
 * default upgrade target. The internal runtime argument makes downloads
 * testable without networking or touching a real installed executable. */
export async function upgrade(options = {}, context = {}, runtime = {}) {
  const fetcher = runtime.fetch ?? globalThis.fetch;
  const output = runtime.output ?? process.stderr;
  const current = context.currentVersion ?? "0.0.0";
  const variant = context.variant ?? "typescript";
  output.write(`Checking Rocksky CLI updates (installed ${current})…\n`);
  const release = await latestRelease(fetcher, options.version);
  const version = release.tag_name.slice("rocksky-cli-v".length);
  const newer = compareVersions(version, current) > 0;
  output.write(
    newer
      ? `Rocksky CLI ${version} is available.\n`
      : `Latest release: ${version}; installed: ${current}.\n`,
  );
  if (options.check) return;
  if (!options.force && !options.output && !options.version && !newer) {
    output.write("Rocksky CLI is up to date.\n");
    return;
  }
  const executable =
    runtime.binaryPath ??
    (globalThis[binaryMarker] ? process.execPath : undefined);
  if (!options.output && !executable)
    throw new Error(
      'This is a Node/Bun package installation. Use npm install -g @rocksky/cli, or download a standalone binary with rocksky upgrade --output "$HOME/.local/bin/rocksky".',
    );
  let target = path.resolve(options.output ?? executable);
  // Resolve installer-created symlinks so they keep pointing at the binary.
  try {
    target = await fs.realpath(target);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const name = releaseAsset(
    runtime.platform ?? process.platform,
    runtime.arch ?? process.arch,
    variant,
  );
  const asset = release.assets?.find((asset) => asset.name === name);
  const checksumAsset = release.assets?.find(
    (asset) => asset.name === name + ".sha256",
  );
  if (
    !asset ||
    !checksumAsset ||
    !Number.isSafeInteger(asset.size) ||
    asset.size <= 0
  )
    throw new Error(
      `The release is missing ${name} or its checksum. Try again after release publishing finishes.`,
    );
  const base = `${DOWNLOAD}/${release.tag_name}/${name}`;
  const checksumResponse = await fetcher(base + ".sha256", {
    signal: AbortSignal.timeout(30_000),
  });
  if (!checksumResponse.ok)
    throw new Error(
      `Checksum download failed (HTTP ${checksumResponse.status}).`,
    );
  const checksum = await checksumResponse.text();
  const match = /^([a-fA-F0-9]{64})\s+\*?([^\r\n]+)\s*$/.exec(checksum);
  if (!match || match[2] !== name)
    throw new Error("Invalid release checksum file.");
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = await fs.mkdtemp(
    path.join(path.dirname(target), ".rocksky-upgrade-"),
  );
  const staging = path.join(temporary, "rocksky");
  const abort = new AbortController();
  const interrupted = () => abort.abort(new Error("Download interrupted."));
  process.once("SIGINT", interrupted);
  process.once("SIGTERM", interrupted);
  let file, reader;
  let progressStarted = false,
    progressFinished = false;
  try {
    const response = await fetcher(base, {
      signal: AbortSignal.any([abort.signal, AbortSignal.timeout(600_000)]),
    });
    if (!response.ok || !response.body)
      throw new Error(`Binary download failed (HTTP ${response.status}).`);
    const report = progress(output, version);
    report(0, asset.size);
    progressStarted = true;
    reader = response.body.getReader();
    file = await fs.open(staging, "wx", 0o700);
    const hash = createHash("sha256");
    let received = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > asset.size)
        throw new Error("Download exceeded the expected release size.");
      hash.update(value);
      await file.writeFile(value);
      report(received, asset.size);
    }
    report(received, asset.size, true);
    progressFinished = true;
    if (received !== asset.size) throw new Error("Incomplete binary download.");
    if (hash.digest("hex") !== match[1].toLowerCase())
      throw new Error(
        "SHA-256 checksum mismatch; the installed CLI was not changed.",
      );
    let mode = 0o755;
    try {
      mode = (await fs.stat(target)).mode & 0o777;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await file.chmod(mode | 0o111);
    await file.sync();
    await file.close();
    file = undefined;
    await fs.rename(staging, target);
    output.write(
      `Installed Rocksky CLI ${version} (${formatSize(received)}) at ${target}\n`,
    );
  } finally {
    process.off("SIGINT", interrupted);
    process.off("SIGTERM", interrupted);
    if (progressStarted && !progressFinished && output.isTTY)
      output.write("\n");
    try {
      await reader?.cancel();
    } catch {}
    try {
      await file?.close();
    } finally {
      await fs.rm(temporary, { recursive: true, force: true });
    }
  }
}
export const upgradeGleam = (options, currentVersion) =>
  upgrade(options, { currentVersion, variant: "typescript" });
