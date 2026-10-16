#!/usr/bin/env python3
"""Smoke-test the actual binary using a disposable SQLite catalog and loopback HTTP."""
import json
import os
import pathlib
import socket
import sqlite3
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
subprocess.run(['opam', 'exec', '--', 'dune', 'build', 'bin/main.exe'], cwd=ROOT, check=True)
binary = ROOT / '_build/default/bin/main.exe'
result = json.loads(subprocess.check_output([str(binary), 'resolve', str(ROOT / 'examples/beat-it.json')]))
assert result['status'] == 'matched' and result['track']['id'] == 'original'
with tempfile.TemporaryDirectory(prefix='matcher-cli-') as directory:
    catalog = pathlib.Path(directory) / 'catalog.sqlite3'
    with sqlite3.connect(catalog) as db:
        db.executescript('''
CREATE TABLE tracks (xata_id TEXT, title TEXT, artist TEXT, album TEXT, album_artist TEXT, duration INTEGER, mb_id TEXT, isrc TEXT, album_art TEXT, track_number INTEGER, disc_number INTEGER, label TEXT, spotify_link TEXT, genre TEXT);
CREATE TABLE albums (xata_id TEXT, title TEXT, release_date TEXT);
CREATE TABLE album_tracks (track_id TEXT, album_id TEXT);
INSERT INTO tracks VALUES ('original','Beat It','Michael Jackson','Thriller','Michael Jackson',258000,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL);
''')
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        port = probe.getsockname()[1]
    env = {k: v for k, v in os.environ.items() if not k.startswith(('SPOTIFY_', 'MATCHING_'))
           and k not in ['DEEZER_URL', 'MUSICBRAINZ_URL', 'DATABASE_URL', 'XATA_READ_POSTGRES_URL', 'REDIS_URL']}
    env.update(DATABASE_URL=f'sqlite:{catalog}', MATCHING_BIND=f'127.0.0.1:{port}')
    process = subprocess.Popen([str(binary), 'serve'], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    base = f'http://127.0.0.1:{port}'
    try:
        deadline = time.monotonic() + 5
        while True:
            if process.poll() is not None:
                raise RuntimeError(process.stderr.read().decode())
            try:
                with urllib.request.urlopen(base + '/health', timeout=0.3) as response:
                    assert json.load(response) == {'status': 'ok'}
                break
            except urllib.error.URLError:
                if time.monotonic() >= deadline:
                    raise
                time.sleep(0.05)
        payload = json.dumps({'title': 'Beat It', 'artists': ['Michael Jackson'], 'album': 'Thriller'}).encode()
        request = urllib.request.Request(base + '/v1/match', data=payload, headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(request, timeout=5) as response:
            assert response.headers['x-matching-cache'] == 'BYPASS'
            result = json.load(response)
            assert result['status'] == 'matched' and result['track']['id'] == 'original'
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
            raise
    assert process.returncode == 0
print('CLI resolve, server startup, catalog matching and SIGTERM shutdown passed')
