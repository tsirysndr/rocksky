#!/usr/bin/env python3
"""Run under dbus-run-session and xvfb-run; require a window and sustained startup."""
from pathlib import Path
import os
import subprocess
import sys
import tempfile
import time

launcher = Path(sys.argv[1]).resolve()
with tempfile.TemporaryFile(mode="w+") as output, tempfile.TemporaryDirectory() as audio_dir:
    # CI has no sound card. Give the real engine an ALSA null device for this
    # packaging test; do not require access to (or play through) host hardware.
    audio_config = Path(audio_dir) / "asound.conf"
    audio_config.write_text('pcm.!default { type null }\n')
    environment = {**os.environ, "ALSA_CONFIG_PATH": str(audio_config)}
    process = subprocess.Popen([str(launcher)], cwd=launcher.parent,
                               stdout=output, stderr=subprocess.STDOUT, env=environment)
    try:
        window_seen = False
        for _ in range(20):
            time.sleep(1)
            if process.poll() is not None:
                raise RuntimeError(f"AppImage exited during startup (status {process.returncode})")
            windows = subprocess.run(["xwininfo", "-root", "-tree"],
                                     capture_output=True, text=True, check=True)
            window_seen |= '"Rocksky"' in windows.stdout
        if not window_seen:
            raise RuntimeError("AppImage stayed running but did not show a Rocksky window")
        print("Rocksky showed a window and stayed running for 20 seconds")
    except Exception:
        output.seek(0)
        print(output.read(), file=sys.stderr)
        raise
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
