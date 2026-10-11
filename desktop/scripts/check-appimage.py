#!/usr/bin/env python3
"""Check extracted release contents, including access by a different Linux user."""
import argparse
from pathlib import Path
import re
import stat
import subprocess


def check(root: Path, max_glibc=(2, 35)) -> list[str]:
    errors = []
    for name in ("AppRun", "AppRun.wrapped", "usr/bin/rocksky-desktop"):
        path = root / name
        if not path.is_file() or path.stat().st_mode & 0o555 != 0o555:
            errors.append(f"{name}: must be readable and executable by every user (0755)")
    for name in ("libfribidi.so.0", "libharfbuzz.so.0"):
        if not (root / "usr/lib" / name).is_file():
            errors.append(f"usr/lib/{name}: required library is missing from the AppImage")
    highest = (0, 0)
    for path in sorted(root.rglob("*")):
        if path.is_symlink():
            continue
        mode = path.stat().st_mode
        relative = path.relative_to(root)
        if stat.S_ISDIR(mode):
            if mode & 0o005 != 0o005:
                errors.append(f"{relative}: directory is inaccessible to other users")
            continue
        if not stat.S_ISREG(mode):
            continue
        if not mode & 0o004:
            errors.append(f"{relative}: file is unreadable by other users")
        if mode & 0o111 and not mode & 0o001:
            errors.append(f"{relative}: executable is not executable by other users")
        with path.open("rb") as file:
            elf = file.read(4) == b"\x7fELF"
        if elf:
            result = subprocess.run(["readelf", "--version-info", str(path)],
                                    capture_output=True, text=True, check=True)
            versions = [tuple(map(int, match.split(".")))
                        for match in re.findall(r"\bGLIBC_(\d+(?:\.\d+)+)\b", result.stdout)]
            required = max(versions, default=(0, 0))
            highest = max(highest, required)
            if required > max_glibc:
                errors.append(f"{relative}: requires GLIBC_{'.'.join(map(str, required))}, above the 2.35 baseline")
    print(f"Highest bundled ELF glibc requirement: {'.'.join(map(str, highest))}")
    return errors


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("appdir", type=Path)
    args = parser.parse_args()
    failures = check(args.appdir.resolve())
    if failures:
        raise SystemExit("\n".join(failures))
    print("AppImage permissions and glibc baseline verified")
