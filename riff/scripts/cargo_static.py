"""Run Cargo with a verified, cached DuckDB static release (no C++ compilation)."""

import fcntl
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import zipfile

# Keep these paired with the exact duckdb/libduckdb-sys version in Cargo.toml.
VERSION = "1.5.5"
ASSETS = {
    "x86_64-unknown-linux-gnu": (
        "linux-amd64",
        "deb47c5300f3c99725e84cdb14d214c3b12bbd748b613b1698b938c894cb68eb",
    ),
    "aarch64-unknown-linux-gnu": (
        "linux-arm64",
        "ea6a34cb49ec2db5ed23d9e8311237c53c32abf9cdbf5dd608c4176c3dd8bfeb",
    ),
    "x86_64-apple-darwin": (
        "osx-amd64",
        "a27d36fa1247a3ffa1692e7aa0bf4ea4d1e0ee51da7c4df7a5db5217357b1b4d",
    ),
    "aarch64-apple-darwin": (
        "osx-arm64",
        "d79ec66b8a4054b866faada82e9e31f859a713c555b3f1c4b71c4a43d3273e9c",
    ),
}


def main():
    root = Path(__file__).resolve().parents[1]
    os.chdir(root)
    args = sys.argv[1:] or ["build", "--release"]
    host = next(line.removeprefix("host: ") for line in
                subprocess.check_output(["rustc", "-vV"], text=True).splitlines()
                if line.startswith("host: "))
    target = os.environ.get("CARGO_BUILD_TARGET", host)
    for i, arg in enumerate(args):
        if arg == "--target":
            target = args[i + 1]
        elif arg.startswith("--target="):
            target = arg.split("=", 1)[1]
    if target != host or host not in ASSETS:
        raise SystemExit("Prebuilt builds support native Linux GNU/macOS x86_64 and ARM64. "
                         "For other targets use cargo --features bundled-duckdb.")
    asset, checksum = ASSETS[host]
    cache = root / "target" / "prebuilt-duckdb" / VERSION / host
    cache.mkdir(parents=True, exist_ok=True)
    libdir = cache / "lib"
    # Serialize preparation across build/test processes; Cargo locks only later.
    with (cache / ".lock").open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if not (libdir / "libduckdb_static.a").is_file():
            with tempfile.TemporaryDirectory(prefix="download-", dir=cache) as tmp:
                staging = Path(tmp)
                archive = staging / "duckdb.zip"
                url = (f"https://github.com/duckdb/duckdb/releases/download/v{VERSION}/"
                       f"static-libs-{asset}.zip")
                print(f"Downloading DuckDB {VERSION}: {asset}", flush=True)
                subprocess.run(["curl", "--fail", "--location", "--show-error",
                                "--silent", "--retry", "3", "--connect-timeout", "15",
                                "--max-time", "300", url, "--output", str(archive)], check=True)
                if hashlib.sha256(archive.read_bytes()).hexdigest() != checksum:
                    raise SystemExit("DuckDB archive checksum mismatch")
                parts = staging / "parts"
                with zipfile.ZipFile(archive) as bundle:
                    bundle.extractall(parts)
                libs = sorted(parts.glob("*.a"))
                for required in ("libduckdb_static.a", "libjson_extension.a",
                                 "libparquet_extension.a", "duckdb.h"):
                    if not (parts / required).is_file():
                        raise SystemExit(f"DuckDB release is missing {required}")
                prepared = staging / "lib"
                prepared.mkdir()
                merged = prepared / "libduckdb_static.a"
                # The release splits core, extensions and third-party dependencies.
                # Merge archive members, not nested .a files, so the Rust linker
                # can resolve all of them without order-dependent -l arguments.
                if "apple" in host:
                    subprocess.run(["libtool", "-static", "-o", str(merged),
                                    *map(str, libs)], check=True)
                else:
                    # MRI paths are relative and contain no spaces.
                    script = "CREATE ../lib/libduckdb_static.a\n"
                    script += "".join(f"ADDLIB {lib.name}\n" for lib in libs)
                    script += "SAVE\nEND\n"
                    subprocess.run(["ar", "-M"], cwd=parts, input=script,
                                   text=True, check=True)
                shutil.copy2(parts / "duckdb.h", prepared / "duckdb.h")
                prepared.rename(libdir)
    print(f"Using prebuilt static DuckDB {VERSION}: {libdir}", flush=True)
    env = os.environ.copy()
    env.update(DUCKDB_LIB_DIR=str(libdir), DUCKDB_INCLUDE_DIR=str(libdir), DUCKDB_STATIC="1")
    os.execvpe("cargo", ["cargo", *args], env)


if __name__ == "__main__":
    main()
