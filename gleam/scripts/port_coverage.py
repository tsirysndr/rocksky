"""Report source modules still needing an implementation or parity review."""
from pathlib import Path
import re
import json

root = Path(__file__).resolve().parents[1]
source = root.parent / 'apps/api/src'
target = root / 'src/rocksky_api'

def snake(name):
    return re.sub(r'(?<!^)(?=[A-Z])', '_', name).replace('-', '_').lower()

# Paths intentionally reorganized in the Gleam port. Presence still requires
# behavioral review; this inventory does not claim a module is complete.
aliases = {
    'users/utils.ts': 'views/song.gleam',
    'import/app.ts': 'history_import/app.gleam',
    'uploads/delete.service.ts': 'uploads/delete_service.gleam',
    'drizzle.ts': 'db/db.gleam',
    'lib/plc.ts': 'env.gleam',
    'typesense/client.ts': 'node/typesense.gleam',
    'lib/storage-crypto.ts': 'node/crypto.gleam',
    'index.ts': 'api.gleam',
    'lib/credits.ts': 'lib/helpers.gleam',
    'shouts/shouts.service.ts': 'shouts/service.gleam',
    'tracks/tracks.service.ts': 'tracks/service.gleam',
    'playlists/playlists.service.ts': 'playlists/service.gleam',
    'lovedtracks/lovedtracks.service.ts': 'lovedtracks/service.gleam',
    'nowplaying/nowplaying.service.ts': 'nowplaying/service.gleam',
    'db.ts': 'db/db.gleam', 'lib/dbQuery.ts': 'db/db.gleam',
    'lib/dbRetry.ts': 'db/retry.gleam', 'lib/env.ts': 'env.gleam',
    'lib/authVerifier.ts': 'xrpc/auth.gleam', 'lib/index.ts': 'lib/helpers.gleam',
    'lib/rsql.ts': 'drizzle/rsql.gleam', 'lib/crypto.ts': 'node/crypto.gleam',
    'lib/extractPdsFromDid.ts': 'lib/extract_pds.gleam',
    'lib/didUnstorageCache.ts': 'lib/id_resolver.gleam',
    'notifications/notifications.service.ts': 'notifications/service.gleam',
    'auth/storage.ts': 'auth/store.gleam', 'sqliteKv.ts': 'kv.gleam',
    'metrics.ts': 'telemetry/metrics.gleam', 'otel.ts': 'node/otel.gleam',
    'profiling.ts': 'node/pyroscope.gleam', 'ratelimiter.ts': 'rest/ratelimiter.gleam',
    'lib/xrpcTelemetry.ts': 'telemetry/xrpc_telemetry.gleam',
    'xrpc/index.ts': 'xrpc/routes.gleam',
    'xrpc/app/rocksky/library/index.ts': 'xrpc/app/rocksky/library/routes.gleam',
}

rows = []
for path in sorted(source.rglob('*.ts')):
    relative = path.relative_to(source)
    if relative.parts[0] in {'lexicon', 'schema', 'types'} or path.name.endswith('.test.ts'):
        continue
    parts = list(relative.with_suffix('').parts)
    mapped = target.joinpath(*(snake(p) for p in parts)).with_suffix('.gleam')
    if str(relative) in aliases:
        mapped = target / aliases[str(relative)]
    rows.append({'source': str(relative), 'target': str(mapped.relative_to(root)),
                 'status': 'source-empty' if not path.read_text().strip() else 'present-needs-parity-review' if mapped.exists() else 'missing'})
print(json.dumps({'source_modules': len(rows), 'missing': sum(r['status'] == 'missing' for r in rows), 'modules': rows}, indent=2))
