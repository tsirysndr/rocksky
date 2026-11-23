"""Exercise the shared OpenTUI adapter through the Gleam command dispatcher."""
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[3]
subprocess.run([
    sys.executable, str(root / "apps/cli/test/terminal-smoke.py"),
    str(root / "gleam/cli/dist/index.mjs"),
], check=True)
