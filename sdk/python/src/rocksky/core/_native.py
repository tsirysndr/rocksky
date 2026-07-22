"""Resolves the native rocksky-uniffi library, downloading a prebuilt from the
GitHub release on first use when it isn't already present locally.

Order of preference:
  1. librocksky_uniffi.<ext> next to this file — a local ./build-core.sh dev build.
  2. A checksum-verified copy in the user cache, downloaded on first load (the
     published-wheel path: the native lib is not bundled in the pure-Python wheel).

The wheel ships manifest.json (repo, release tag, one sha256 per target triple)
— filled from the release artifacts by sdk/scripts/gen-uniffi-manifest.sh. The
generated `rocksky_uniffi.py` loader is patched by build-core.sh to call resolve().
"""

from __future__ import annotations

import hashlib
import json
import os
import platform
import sys
import urllib.request
from pathlib import Path

_HERE = Path(__file__).resolve().parent


def _ext() -> str:
    if sys.platform == "darwin":
        return "dylib"
    if sys.platform.startswith("win"):
        return "dll"
    return "so"


def _arch() -> str:
    m = platform.machine().lower()
    if m in ("x86_64", "amd64"):
        return "x86_64"
    if m in ("aarch64", "arm64"):
        return "aarch64"
    return m


def _triple() -> str:
    ext_os = sys.platform
    if ext_os == "darwin":
        return f"{_arch()}-apple-darwin"
    if ext_os.startswith("linux"):
        return f"{_arch()}-linux-gnu"
    if ext_os.startswith("freebsd"):
        return f"{_arch()}-unknown-freebsd"
    if ext_os.startswith("netbsd"):
        return f"{_arch()}-unknown-netbsd"
    if ext_os.startswith("openbsd"):
        return f"{_arch()}-unknown-openbsd"
    raise RuntimeError(f"unsupported platform: {ext_os}")


def _cache_dir(tag: str) -> Path:
    base = os.environ.get("XDG_CACHE_HOME") or os.path.join(Path.home(), ".cache")
    return Path(base) / "rocksky" / tag


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def resolve() -> str:
    """Absolute path to a loadable native library, fetching it if necessary."""
    ext = _ext()
    local = _HERE / f"librocksky_uniffi.{ext}"
    if local.exists():
        return str(local)

    manifest = json.loads((_HERE / "manifest.json").read_text())
    triple = _triple()
    sha = manifest.get("checksums", {}).get(triple)
    if not sha:
        raise RuntimeError(
            f"no prebuilt native lib for {triple} (manifest has no checksum) — "
            f"run ./build-core.sh for a local build"
        )
    tag = manifest["tag"]
    dest = _cache_dir(tag) / f"librocksky_uniffi-{triple}.{ext}"
    if dest.exists() and _sha256(dest.read_bytes()) == sha:
        return str(dest)

    url = (
        f"https://github.com/{manifest['repo']}/releases/download/"
        f"{tag}/librocksky_uniffi-{triple}.{ext}"
    )
    with urllib.request.urlopen(url) as resp:  # noqa: S310 (github.com, sha256-verified)
        body = resp.read()
    got = _sha256(body)
    if got != sha:
        raise RuntimeError(f"checksum mismatch for {triple}: want {sha}, got {got}")

    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".download")
    tmp.write_bytes(body)
    tmp.chmod(0o755)
    tmp.replace(dest)
    return str(dest)
