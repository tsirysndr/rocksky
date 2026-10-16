#!/usr/bin/env python3
"""Test an isolated, temporary PostgreSQL cluster; never uses the user's database."""
import os
import pathlib
import shutil
import subprocess
import tempfile
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parents[1]
for executable in ['initdb', 'pg_ctl', 'psql']:
    if shutil.which(executable) is None:
        raise SystemExit(f'{executable} is required on PATH')
with tempfile.TemporaryDirectory(prefix='matcher-pg-', dir='/tmp') as directory:
    root = pathlib.Path(directory)
    data = root / 'data'
    socket = root / 'socket'
    socket.mkdir()
    subprocess.run(['initdb', '-D', str(data), '-U', 'matcher_test', '-A', 'trust', '--no-locale'], check=True, stdout=subprocess.DEVNULL)
    started = False
    try:
        subprocess.run(['pg_ctl', '-D', str(data), '-l', str(root / 'postgres.log'), '-o',
                        f"-h '' -k {socket} -p 55439", '-w', 'start'], check=True)
        started = True
        url = 'postgresql://matcher_test@/postgres?' + urllib.parse.urlencode({'host': str(socket), 'port': '55439'})
        sql = '''CREATE TABLE tracks (xata_id TEXT, title TEXT, artist TEXT, album TEXT, album_artist TEXT, duration BIGINT, mb_id TEXT, isrc TEXT, album_art TEXT, track_number INTEGER, disc_number INTEGER, label TEXT, spotify_link TEXT, genre TEXT);
CREATE TABLE albums (xata_id TEXT, title TEXT, release_date DATE);
CREATE TABLE album_tracks (track_id TEXT, album_id TEXT);
INSERT INTO tracks VALUES ('a','Beat It','Michael Jackson','Thriller','Michael Jackson',240000,NULL,'USABC1212345',NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO tracks VALUES ('b','Wrong Title','Wrong Artist','Other','Other',180000,NULL,'USABC1212345',NULL,NULL,NULL,NULL,NULL,NULL);
'''
        subprocess.run(['psql', '-X', '-d', url, '-v', 'ON_ERROR_STOP=1', '-c', sql], check=True, stdout=subprocess.DEVNULL)
        env = os.environ.copy()
        env['MATCHER_TEST_POSTGRES_URL'] = url
        subprocess.run(['opam', 'exec', '--', 'dune', 'exec', 'test/test_postgres.exe'], cwd=ROOT, env=env, check=True)
    finally:
        if started:
            subprocess.run(['pg_ctl', '-D', str(data), '-m', 'immediate', '-w', 'stop'], check=True)
