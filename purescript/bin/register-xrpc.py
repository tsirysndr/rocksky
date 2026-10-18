from pathlib import Path
import re
root = Path(__file__).resolve().parents[1] / 'api/src/Rocksky/Xrpc'
groups = {}
for path in sorted((root / 'App/Rocksky').glob('*/*.purs')):
    if re.search(r'\bregister\s*::', path.read_text()):
        groups.setdefault(path.parent.name, []).append(path.stem)
base = 'import Prelude\n\nimport Effect (Effect)\nimport Rocksky.Context (Context)\nimport Rocksky.Lexicon (Server)\n'
for group, names in groups.items():
    (root / f'Groups/{group}.purs').write_text(f'module Rocksky.Xrpc.Groups.{group} (register) where\n\n' + base + ''.join(f'import Rocksky.Xrpc.App.Rocksky.{group}.{n} as {n}\n' for n in names) + '\nregister :: Server -> Context -> Effect Unit\nregister server ctx = do\n' + ''.join(f'  {n}.register server ctx\n' for n in names))
(root / 'Index.purs').write_text('-- | Registers all currently ported XRPC methods.\nmodule Rocksky.Xrpc.Index (register) where\n\n' + base + ''.join(f'import Rocksky.Xrpc.Groups.{g} as {g}\n' for g in groups) + '\nregister :: Server -> Context -> Effect Unit\nregister server ctx = do\n' + ''.join(f'  {g}.register server ctx\n' for g in groups))
print(f'Registered {sum(map(len, groups.values()))} handlers across {len(groups)} groups.')
