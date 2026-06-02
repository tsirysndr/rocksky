import type { Registry, NamedType, TypeRef } from "./registry";

const HEADER = `// AUTO-GENERATED FILE -- DO NOT EDIT.
// Source: apps/api/lexicons/**/*.json
// Regenerate via: bun run lexgen:types

import gleam/dynamic.{type Dynamic}
import gleam/option.{type Option}

pub type BlobRef {
  BlobRef(
    type_: Option(String),
    ref: Option(BlobCidRef),
    mime_type: Option(String),
    size: Option(Int),
  )
}

pub type BlobCidRef {
  BlobCidRef(link: Option(String))
}
`;

const GLEAM_KEYWORDS = new Set([
  "as", "assert", "case", "const", "external", "fn", "if", "import",
  "let", "opaque", "panic", "pub", "todo", "type", "use", "echo",
]);

function camelToSnake(s: string): string {
  return s.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");
}

function gleamFieldName(camel: string): string {
  let snake = camelToSnake(camel);
  if (GLEAM_KEYWORDS.has(snake)) snake = snake + "_";
  if (/^[0-9]/.test(snake)) snake = "_" + snake;
  return snake;
}

function gleamPrim(name: string): string {
  switch (name) {
    case "string":
    case "datetime":
    case "at-uri":
    case "uri":
    case "at-identifier":
    case "did":
    case "cid":
    case "cid-link":
      return "String";
    case "integer":
      return "Int";
    case "boolean":
      return "Bool";
    case "bytes":
      return "BitArray";
    case "blob":
      return "BlobRef";
    default:
      return "Dynamic";
  }
}

function gleamType(t: TypeRef): string {
  switch (t.kind) {
    case "primitive":
      return gleamPrim(t.name);
    case "array":
      return `List(${gleamType(t.items)})`;
    case "ref":
      return t.targetId === "unknown" ? "Dynamic" : t.targetId;
    case "union":
      return "Dynamic";
    case "unknown":
      return "Dynamic";
  }
}

function emitType(t: NamedType): string {
  const lines: string[] = [];
  if (t.description) lines.push(`/// ${t.description.replace(/\n/g, " ")}`);
  lines.push(`pub type ${t.name} {`);
  if (t.fields.length === 0) {
    lines.push(`  ${t.name}`);
    lines.push(`}`);
    return lines.join("\n");
  }
  lines.push(`  ${t.name}(`);
  for (const f of t.fields) {
    const name = gleamFieldName(f.name);
    const base = gleamType(f.type);
    let ty: string;
    if (f.required) {
      ty = base;
    } else if (f.type.kind === "array") {
      ty = base;
    } else {
      ty = `Option(${base})`;
    }
    lines.push(`    ${name}: ${ty},`);
  }
  lines.push(`  )`);
  lines.push(`}`);
  return lines.join("\n");
}

export function emitGleam(reg: Registry): string {
  return [HEADER, ...reg.types.map(emitType)].join("\n\n") + "\n";
}
