"""Exercise the actual Node terminal adapter offline, without audio or accounts."""
import os
import pty
import select
import subprocess
import tempfile
import time
from pathlib import Path

root = Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory(prefix="gleam-tui-") as tmp:
    mock = Path(tmp) / "mock.mjs"
    mock.write_text("""
import os from 'node:os';
import {registerHooks,syncBuiltinESMExports} from 'node:module';
os.homedir=()=>process.env.ROCKSKY_STATE_DIR;
syncBuiltinESMExports();
const nativeFetch=globalThis.fetch;
globalThis.fetch=async(url,opts)=>String(url).startsWith('data:')?nativeFetch(url,opts):new Response(JSON.stringify([]));
const stubs={
  'rockbox-ffi/node': 'export class Player { constructor(){return new Proxy(this,{get:(_,k)=>k==="status"?()=>null:()=>{}});} }',
  '@rocksky/sdk/remote': 'export class RemotePlayer {on(){return this;} connect(){} disconnect(){} setStatus(){} setNowPlaying(){} setQueue(){}}',
  'nfc-pcsc': 'throw new Error("NFC disabled in terminal smoke test");',
  '@pokusew/pcsclite': 'throw new Error("PCSC disabled in terminal smoke test");',
};
registerHooks({resolve(specifier,context,next){return Object.hasOwn(stubs,specifier)?{url:'data:text/javascript,'+encodeURIComponent(stubs[specifier]),shortCircuit:true}:next(specifier,context);}});
""")
    master, slave = pty.openpty()
    env = {**os.environ, "ROCKSKY_STATE_DIR": tmp, "ROCKSKY_CACHE_DIR": tmp + "/cache",
           "ROCKSKY_NO_REMOTE": "1", "ROCKSKY_NO_NFC": "1", "DOTENV_CONFIG_PATH": tmp + "/none", "XDG_CACHE_HOME": tmp + "/cache", "XDG_CONFIG_HOME": tmp + "/config", "XDG_DATA_HOME": tmp + "/data"}
    proc = subprocess.Popen(["node", "--import", str(mock), "cli/dist/index.mjs", "tui"],
                            cwd=root, stdin=slave, stdout=slave, stderr=slave, env=env)
    os.close(slave)
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
        read_for(.8)
        for key in [b"2", b"e", b"\x1b", b"q"]:
            assert proc.poll() is None, output.decode(errors="replace")
            os.write(master, key)
            # readline waits 500 ms to distinguish Escape from an escape sequence.
            read_for(.8)
        proc.wait(timeout=5)
        assert proc.returncode == 0, output[-2000:]
        assert b"\x1b[?1049h" in output and b"\x1b[?1049l" in output, output[-2000:]
        assert b"Rocksky" in output or b"Global Scrobbles" in output, output[-2000:]
        print("PTY smoke passed: TSX/Ink frames render, navigation works, q restores the terminal.")
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait()
        os.close(master)
