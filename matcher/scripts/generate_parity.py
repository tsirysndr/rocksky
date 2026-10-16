#!/usr/bin/env python3
"""Generate offline policy fixtures using the checked-in Rust implementation.

Run: python3 scripts/generate_parity.py
Requires Rust and cached serde/serde_json/unicode-normalization dependencies.
No provider calls or production credentials are used.
"""
import copy
import hashlib
import json
import pathlib
import random
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
RUST = ROOT.parent / 'crates' / 'matching'


def summarize(response):
    track = response['track']
    return {
        'status': response['status'],
        'selected': None if track is None else [track['source'], track['id']],
        'ranked': [[c['track']['source'], c['track']['id'], c['rank'], c['reasons']]
                   for c in response['candidates']],
        'rejected': sorted([[c['source'], c['id'], sorted(c['reasons'])]
                            for c in response['rejected']]),
    }


def cases():
    rng = random.Random(20261016)
    base_request = {'title': 'Beat It', 'artists': ['Michael Jackson']}
    base_candidate = {'source': 'fixture', 'id': 'a', 'title': 'Beat It',
                      'artists': ['Michael Jackson'], 'albumType': 'album'}
    result = []
    for i in range(400):
        request = copy.deepcopy(base_request)
        if i % 4 == 0:
            request['album'] = rng.choice(['Thriller', 'Bad', 'Thriller (2003 Remaster)'])
        if i % 3 == 0:
            request['durationMs'] = rng.choice([200000, 500000])
        if i % 5 == 0:
            request['identifiers'] = {'isrc': 'US-ABC-12-12345'}
        candidates = []
        for k in range(rng.randrange(1, 5)):
            candidate = copy.deepcopy(base_candidate)
            candidate.update(id=str(k),
                title=rng.choice(['Beat It', 'BEAT IT!', 'Beat It (Live)',
                                  'Beat It (Time of Your Life)', 'Beat It (Club Mix)', 'Wrong']),
                artists=rng.choice([['Michael Jackson'], ['MICHAEL JACKSON'],
                                    ['Michael Jackson', 'Guest'], ['Wrong']]),
                album=rng.choice([None, 'Thriller', 'Bad', 'Thriller (2003 Remaster)',
                                  'Live Through This', 'Live at Wembley']),
                albumType=rng.choice([None, 'album', 'single']),
                durationMs=rng.choice([None, 0, 195000, 200000, 205000, 205001, 510000]),
                releaseStatus=rng.choice([None, 'official', 'bootleg']),
                country=rng.choice([None, 'US', 'XW', 'FR']))
            if rng.randrange(2):
                candidate['identifiers'] = {'isrc': rng.choice(['USABC1212345', 'GBAYE9701368'])}
            candidates.append(candidate)
        result.append({'name': f'seeded-{i}', 'request': request, 'candidates': candidates})
    for title, artists in [('Beyoncé', ['Björk']), ('宇多田ヒカル', ['東京']),
                           ('Good Riddance', ['Green Day'])]:
        c = copy.deepcopy(base_candidate)
        c.update(title=title, artists=artists)
        result.append({'name': title, 'request': {'title': title, 'artists': artists}, 'candidates': [c]})
    # Verified copies, with and without conflicting evidence.
    for mode in ['same', 'duration', 'isrc', 'credits', 'missing', 'mbid']:
        cs = []
        for i in range(3):
            c = copy.deepcopy(base_candidate)
            c.update(id=str(i), album='Thriller', durationMs=240000,
                     identifiers={'isrc': 'USABC1212345'})
            cs.append(c)
        if mode == 'duration': cs[1]['durationMs'] = 180000
        if mode == 'isrc': cs[1]['identifiers']['isrc'] = 'GBAYE9701368'
        if mode == 'credits': cs[1]['artists'].append('Guest')
        if mode == 'missing': cs[1]['identifiers'] = {}
        if mode == 'mbid':
            cs[1]['identifiers']['musicbrainzRecordingId'] = 'one'
            cs[2]['identifiers']['musicbrainzRecordingId'] = 'two'
        result.append({'name': f'recording-{mode}', 'request': base_request, 'candidates': cs})
    return result


def main():
    source = (RUST / 'src/lib.rs').read_text()
    credits = (ROOT.parent / 'crates/core/src/credits.rs').read_text()
    fold = credits[credits.index('pub fn fold('):credits.index('\n#[cfg(test)]')]
    standalone = '\n'.join(line for line in source.splitlines() if not line.startswith('pub mod '))
    standalone = standalone.replace('use rocksky_core::credits::fold;',
        'use unicode_normalization::char::is_combining_mark;\nuse unicode_normalization::UnicodeNormalization;')
    with tempfile.TemporaryDirectory(prefix='matcher-parity-') as directory:
        root = pathlib.Path(directory)
        (root / 'src').mkdir()
        (root / 'tests').mkdir()
        (root / 'src/lib.rs').write_text(standalone + '\n' + fold)
        (root / 'tests/policy.rs').write_text((RUST / 'tests/policy.rs').read_text())
        (root / 'Cargo.toml').write_text('''[package]
name = "rocksky-matching"
version = "0.0.0"
edition = "2024"
[dependencies]
serde = {version="1", features=["derive"]}
serde_json="1"
unicode-normalization="0.1"
''')
        (root / 'src/main.rs').write_text('''use std::io::{self, BufRead};
use rocksky_matching::{MatchRequest, Candidate, resolve};
fn main() {
    for line in io::stdin().lock().lines() {
        let v: serde_json::Value = serde_json::from_str(&line.unwrap()).unwrap();
        let r: MatchRequest = serde_json::from_value(v["request"].clone()).unwrap();
        let cs: Vec<Candidate> = serde_json::from_value(v["candidates"].clone()).unwrap();
        println!("{}", serde_json::to_string(&resolve(&r, cs).unwrap()).unwrap());
    }
}
''')
        subprocess.run(['cargo', 'test', '--offline', '--manifest-path', str(root / 'Cargo.toml')], check=True)
        vectors = cases()
        run = subprocess.run([str(root / 'target/debug/rocksky-matching')],
            input='\n'.join(json.dumps(v) for v in vectors), text=True, capture_output=True, check=True)
        outputs = run.stdout.splitlines()
        assert len(outputs) == len(vectors)
        for vector, output in zip(vectors, outputs):
            vector['expected'] = summarize(json.loads(output))
        document = {'rustPolicySha256': hashlib.sha256(source.encode()).hexdigest(), 'cases': vectors}
        (ROOT / 'test/fixtures/policy.json').write_text(json.dumps(document, ensure_ascii=False, separators=(',', ':')) + '\n')
        print(f'Generated {len(vectors)} Rust parity cases')

if __name__ == '__main__':
    main()
