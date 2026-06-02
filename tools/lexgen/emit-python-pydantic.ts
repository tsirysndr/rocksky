import type { Registry, NamedType, TypeRef } from "./registry";

const HEADER = `"""AUTO-GENERATED FILE -- DO NOT EDIT.

Source: apps/api/lexicons/**/*.json
Regenerate via: bun run lexgen:types
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


def _camel(name: str) -> str:
    head, *tail = name.split("_")
    return head + "".join(part.title() for part in tail)


class RockskyModel(BaseModel):
    """Base model used by every generated SDK type.

    Accepts both camelCase (alias) and snake_case (field name) input, preserves
    unknown fields ("extra=allow"), and never crashes on a missing key.
    """

    model_config = ConfigDict(
        alias_generator=_camel,
        populate_by_name=True,
        extra="allow",
        str_strip_whitespace=True,
    )


class BlobRef(RockskyModel):
    """atproto blob reference shape."""

    type: str | None = Field(default=None, alias="$type")
    ref: dict[str, Any] | None = None
    mime_type: str | None = None
    size: int | None = None
`;

const PY_KEYWORDS = new Set([
  "False", "None", "True", "and", "as", "assert", "async", "await", "break",
  "class", "continue", "def", "del", "elif", "else", "except", "finally",
  "for", "from", "global", "if", "import", "in", "is", "lambda", "nonlocal",
  "not", "or", "pass", "raise", "return", "try", "while", "with", "yield",
]);

function camelToSnake(s: string): string {
  return s.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");
}

function pySnake(name: string): string {
  let snake = camelToSnake(name);
  if (PY_KEYWORDS.has(snake)) snake = snake + "_";
  if (/^[0-9]/.test(snake)) snake = "_" + snake;
  return snake;
}

function pyPrim(name: string): string {
  switch (name) {
    case "string":
    case "at-uri":
    case "uri":
    case "at-identifier":
    case "did":
    case "cid":
    case "cid-link":
      return "str";
    case "datetime":
      return "datetime";
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

function pyType(t: TypeRef): string {
  switch (t.kind) {
    case "primitive":
      return pyPrim(t.name);
    case "array":
      return `list[${pyType(t.items)}]`;
    case "ref":
      return t.targetId === "unknown" ? "Any" : t.targetId;
    case "union": {
      if (t.options.length === 0) return "Any";
      const opts = t.options.map((o) => (o === "unknown" ? "Any" : o));
      return opts.join(" | ");
    }
    case "unknown":
      return "Any";
  }
}

function emitClass(t: NamedType): string {
  const lines: string[] = [];
  lines.push(`class ${t.name}(RockskyModel):`);
  if (t.description) {
    lines.push(`    """${t.description.replace(/"""/g, '\\"\\"\\"')}"""`);
    lines.push("");
  }
  if (t.fields.length === 0) {
    lines.push(`    pass`);
    return lines.join("\n");
  }
  for (const f of t.fields) {
    const snake = pySnake(f.name);
    const ty = pyType(f.type);
    const renameNeeded = snake !== f.name;
    if (renameNeeded) {
      lines.push(`    ${snake}: ${ty} | None = Field(default=None, alias="${f.name}")`);
    } else {
      lines.push(`    ${snake}: ${ty} | None = None`);
    }
  }
  return lines.join("\n");
}

export function emitPythonPydantic(reg: Registry): string {
  const body = [HEADER, ...reg.types.map(emitClass)].join("\n\n\n");
  const rebuilds = reg.types.map((t) => `${t.name}.model_rebuild()`).join("\n");
  return `${body}\n\n\n${rebuilds}\n`;
}
