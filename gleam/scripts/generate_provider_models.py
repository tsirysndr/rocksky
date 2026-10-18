import re
from pathlib import Path
import sys
source = Path(sys.argv[1])
target = Path(sys.argv[2])
text = source.read_text()
def snake(s):return re.sub(r'(?<!^)(?=[A-Z])','_',s).lower()
def field(s):return snake(s) if s!='type' else 'type_'
def typename(s):
 if s.endswith('[]'):return 'List('+typename(s[:-2])+')'
 return {'string':'String','number':'Int','boolean':'Bool'}.get(s,s)
def decoder(s):
 if s.endswith('[]'):return 'decode.list('+decoder(s[:-2])+')'
 return {'string':'decode.string','number':'decode.int','boolean':'decode.bool'}.get(s,snake(s)+'_decoder()')
s='''//// Generated typed provider payloads. See scripts/generate_provider_models.py.
import gleam/dynamic/decode
import gleam/option.{type Option, None}
'''
for name,body in re.findall(r'export interface (\w+) \{(.*?)\n\}',text,re.S):
 fields=[]
 for key,opt,kind in re.findall(r'(\w+)(\?)?: ([^;]+);',body):
  nullable=bool(opt) or ' | null' in kind;kind=kind.replace(' | null','')
  gt=typename(kind);dec=decoder(kind)
  if key=='score':gt='Float';dec='decode.float'
  fields.append((key,nullable,gt,dec))
 s+=f'\npub type {name} {{ {name}(\n'+''.join(f'{field(k)}: '+(f'Option({t})' if o else t)+',\n' for k,o,t,d in fields)+') }\n'
 s+=f'pub fn {snake(name)}_decoder() {{\n'
 for k,o,t,d in fields:s+=f'use {field(k)} <- '+(f'decode.optional_field("{k}", None, decode.optional({d}))' if o else f'decode.field("{k}", {d})')+'\n'
 s+=f'decode.success({name}('+','.join(field(k) for k,o,t,d in fields)+'))\n}\n'
target.write_text(s)
