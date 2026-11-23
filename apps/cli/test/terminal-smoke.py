"""Offline PTY check of Node-to-Bun launch, input and terminal restoration."""
import fcntl
import os
import pty
import select
import shlex
import shutil
import struct
import subprocess
import sys
import tempfile
import termios
import time
from pathlib import Path

entry = Path(sys.argv[1] if len(sys.argv) > 1 else "apps/cli/dist/index.js").resolve()
with tempfile.TemporaryDirectory(prefix="rocksky-opentui-pty-") as tmp:
    directory = Path(tmp)
    preload = directory / "preload.mjs"
    preload.write_text("""
import os from 'node:os';
import { mock } from 'bun:test';
os.homedir = () => process.env.ROCKSKY_TEST_HOME;
globalThis.fetch = async () => Response.json({scrobbles:[],tracks:[],albums:[],artists:[]});
mock.module('nfc-pcsc', () => { throw new Error('Offline terminal test'); });
mock.module('@pokusew/pcsclite', () => { throw new Error('Offline terminal test'); });
""")
    wrapper = directory / "bun"
    wrapper.write_text(f"#!/bin/sh\nexec {shlex.quote(shutil.which('bun'))} --preload {shlex.quote(str(preload))} \"$@\"\n")
    wrapper.chmod(0o755)
    env = {**os.environ, "PATH": str(directory) + os.pathsep + os.environ["PATH"],
           "ROCKSKY_TEST_HOME": tmp, "HOME": tmp, "XDG_CACHE_HOME": tmp, "ROCKSKY_NO_REMOTE": "1", "TERM": "xterm-256color",
           "DOTENV_CONFIG_PATH": str(directory / "none"), "COLORFGBG": "15;0"}
    for end in [b"q", b"\x03"]:
        master, slave = pty.openpty()
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 38, 120, 0, 0))
        before = termios.tcgetattr(slave)
        command = ["node", str(entry), "tui"] if entry.suffix in [".js", ".mjs"] else [str(entry), "tui"]
        proc = subprocess.Popen(command, stdin=slave, stdout=slave, stderr=slave, env=env)
        output = bytearray()
        def read_for(seconds):
            until = time.monotonic() + seconds
            while time.monotonic() < until:
                if select.select([master], [], [], .05)[0]:
                    try:
                        output.extend(os.read(master, 65536))
                    except OSError:
                        break
        try:
            for _ in range(50):
                read_for(.1)
                if b"rocksky" in output or proc.poll() is not None:
                    break
            assert proc.poll() is None, output.decode(errors="replace")
            assert b"rocksky" in output, output[-3000:].decode(errors="replace")
            for key in [b"2", b"e", b"\x1b", b"?"]:
                os.write(master, key)
                read_for(.15)
            if end == b"q":
                os.write(master, b"\x1b")
                read_for(.15)
            os.write(master, end)
            read_for(.6)
            proc.wait(timeout=8)
            assert proc.returncode == 0, output[-3000:].decode(errors="replace")
            assert b"\x1b[?1049h" in output and b"\x1b[?1049l" in output, output[-3000:]
            after = termios.tcgetattr(slave)
            assert before[3] & (termios.ECHO | termios.ICANON) == after[3] & (termios.ECHO | termios.ICANON), "Terminal input mode was not restored"
        finally:
            if proc.poll() is None:
                proc.kill()
                proc.wait()
            os.close(master)
            os.close(slave)
    print(f"OpenTUI PTY passed: {entry.name}, q / Ctrl-C, alternate-screen and input-mode restoration.")
