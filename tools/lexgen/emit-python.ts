import type { Registry, NamedType, TypeRef } from "./registry";

const HEADER = `"""AUTO-GENERATED FILE — DO NOT EDIT.

Source: apps/api/lexicons/**/*.json
Regenerate via: bun run lexgen:types
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, List, Optional, Union


@dataclass
class BlobRef:
    """atproto blob reference shape."""

    type: Optional[str] = None
    ref: Optional[dict] = None
    mimeType: Optional[str] = None
    size: Optional[int] = None
`;

function pyPrim(name: string): string {
  switch (name) {
    case "string":
    case "datetime":
    case "at-uri":
    case "uri":
    case "at-identifier":
    case "did":
    case "cid":
    case "cid-link":
      return "str";
    case "integer":
      return "int";
    case "boolean":
      return "bool";
    case "bytes":
      return "bytes";
    case "blob":
      return "BlobRef";
    default:
      return "Any";
  }
}

const PY_KEYWORDS = new Set([
  "False", "None", "True", "and", "as", "assert", "async", "await", "break",
  "class", "continue", "def", "del", "elif", "else", "except", "finally",
  "for", "from", "global", "if", "import", "in", "is", "lambda", "nonlocal",
  "not", "or", "pass", "raise", "return", "try", "while", "with", "yield",
]);

function pyFieldName(name: string): string {
  if (PY_KEYWORDS.has(name)) return name + "_";
  if (/^[0-9]/.test(name)) return "_" + name;
  return name;
}

function pyType(t: TypeRef): string {
  switch (t.kind) {
    case "primitive":
      return pyPrim(t.name);
    case "array":
      return `List[${pyType(t.items)}]`;
    case "ref":
      return t.targetId === "unknown" ? "Any" : `"${t.targetId}"`;
    case "union": {
      if (t.options.length === 0) return "Any";
      const opts = t.options.map((o) => (o === "unknown" ? "Any" : `"${o}"`));
      return `Union[${opts.join(", ")}]`;
    }
    case "unknown":
      return "Any";
  }
}

function emitDataclass(t: NamedType): string {
  const lines: string[] = [];
  lines.push(`@dataclass`);
  lines.push(`class ${t.name}:`);
  if (t.description) {
    lines.push(`    """${t.description.replace(/"""/g, '\\"\\"\\"')}"""`);
  }
  const required = t.fields.filter((f) => f.required);
  const optional = t.fields.filter((f) => !f.required);
  if (required.length === 0 && optional.length === 0) {
    lines.push(`    pass`);
    return lines.join("\n");
  }
  for (const f of required) {
    const ty = pyType(f.type);
    lines.push(`    ${pyFieldName(f.name)}: ${ty}`);
  }
  for (const f of optional) {
    const ty = pyType(f.type);
    lines.push(`    ${pyFieldName(f.name)}: Optional[${ty}] = None`);
  }
  return lines.join("\n");
}

export function emitPython(reg: Registry): string {
  return [HEADER, ...reg.types.map(emitDataclass)].join("\n\n\n") + "\n";
}
