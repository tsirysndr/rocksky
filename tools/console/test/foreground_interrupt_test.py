"""Terminal regression: python3 test/foreground_interrupt_test.py BB_OR_CLOJURE.
Runs local test subprocesses only; no services or SSH connections.
"""
import errno
import os
import pty
import re
import select
import signal
import sys
import time

runtime = sys.argv[1]
command = ([runtime, '-cp', 'src', 'repl'] if os.path.basename(runtime) == 'bb'
           else [runtime, '-M', '-e', '(clojure.main/repl)'])
if '--rebel' in sys.argv:
    command = [runtime, '-M:rebel']
pid, fd = pty.fork()
if pid == 0:
    os.execvp(command[0], command)
output = b''


def expect(text, timeout=40):
    global output
    end = time.monotonic() + timeout
    while text not in output:
        if time.monotonic() >= end:
            raise AssertionError(f'Timed out waiting for {text!r}: {output!r}')
        if select.select([fd], [], [], 0.1)[0]:
            try:
                chunk = os.read(fd, 65536)
            except OSError as exc:
                if exc.errno != errno.EIO:
                    raise
                chunk = b''
            if not chunk:
                raise AssertionError(f'REPL exited before {text!r}: {output!r}')
            output += chunk
            output = re.sub(rb"\x1b\[[0-?]*[ -/]*[@-~]", b"", output)
    output = output.split(text, 1)[1]
    print('Observed:', text, flush=True)


def send(text):
    os.write(fd, text.encode())


try:
    expect(b'user=>')
    send('(require \'[console.shell :as sh]) (def preserved-value 42)\n')
    expect(b"#'user/preserved-value")
    expect(b'user=>')
    for _ in range(2):
        # Split the marker so terminal input echo cannot satisfy the assertion.
        send('(sh/sh ["sh" "-c" "printf CHILD_; printf READY; exec sleep 60"])\n')
        expect(b'CHILD_READY')
        os.write(fd, b'\x03')
        expect(b'130')
        expect(b'user=>')
        send('(println (str "PRESERVED=" preserved-value))\n')
        expect(b'PRESERVED=42')
        expect(b'user=>')
    send('(println (str "EXIT=" (sh/sh ["sh" "-c" "exit 7"])))\n')
    expect(b'EXIT=7')
    expect(b'user=>')
    send('(System/exit 0)\n')
    # Drain the PTY while the runtime shuts down.
    end = time.monotonic() + 10
    while time.monotonic() < end:
        done, status = os.waitpid(pid, os.WNOHANG)
        if done:
            assert os.waitstatus_to_exitcode(status) == 0
            pid = None
            break
        if select.select([fd], [], [], 0.1)[0]:
            try:
                os.read(fd, 65536)
            except OSError:
                pass
    assert pid is None, 'REPL did not exit'
    print('PASS: repeated Ctrl-C preserves the REPL and variables; normal exit codes preserved.')
finally:
    if pid is not None:
        try:
            os.killpg(pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        os.close(fd)
        os.waitpid(pid, 0)
    else:
        os.close(fd)
