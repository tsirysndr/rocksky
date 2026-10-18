"""Inventory source modules; presence is not a claim of behavioral parity."""
from pathlib import Path
import json
import re
root = Path(__file__).resolve().parents[1]
source = root.parent / 'apps/api/src'
def component(value):
    return ''.join(part[:1].upper() + part[1:] for part in re.split(r'[-_]', value))
def module_for(path):
    parts = list(path.with_suffix('').parts)
    if parts[-1].endswith('.service'):
        parts[-1] = 'Service'
    else:
        parts[-1:] = parts[-1].split('.')
    return 'Rocksky.' + '.'.join(component(p) for p in parts)
modules = {}
for path in (root / 'api/src').rglob('*.purs'):
    match = re.search(r'^module\s+(\S+)', path.read_text(), re.M)
    if match:
        modules[match[1]] = str(path.relative_to(root))
overrides = {
    'lib/index.ts': 'Rocksky.Lib.Common',
    'schema/index.ts': 'Rocksky.Schema',
    'uploads/delete.service.ts': 'Rocksky.Uploads.DeleteService',
    'types/apikey.ts': 'Rocksky.Types.ApiKey',
    'tealfm/index.ts': 'Rocksky.Tealfm.Index',
    'typesense/client.ts': 'Rocksky.Context',
    'lib/rsql.ts': 'Rocksky.Lib.Rsql',
    'xrpc/app/rocksky/library/index.ts': 'Rocksky.Xrpc.Groups.Library',
}
report = []
for path in sorted(source.rglob('*.ts')):
    rel = path.relative_to(source)
    if any(p in ('lexicon', 'lexicons') for p in rel.parts) or path.name.endswith(('.test.ts', '.d.ts')):
        continue
    module = overrides.get(str(rel), module_for(rel))
    report.append({'source': str(rel), 'module': module, 'target': modules.get(module), 'status': 'mapped' if module in modules else 'missing'})
(root / 'port-inventory.json').write_text(json.dumps(report, indent=2) + '\n')
missing = [r for r in report if r['status'] == 'missing']
print(f'{len(report)} non-generated source modules: {len(report)-len(missing)} mapped, {len(missing)} missing.')
for row in missing:
    print(row['source'])
