import type { Registry, NamedType, TypeRef } from "./registry";

const HEADER = `// AUTO-GENERATED FILE — DO NOT EDIT.
// Source: apps/api/lexicons/**/*.json
// Regenerate via: bun run lexgen:types

export interface BlobRef {
  $type?: "blob";
  ref?: { $link?: string };
  mimeType?: string;
  size?: number;
}

export type CidLink = string;
export type DateTime = string;
export type AtUri = string;
export type AtIdentifier = string;
export type Did = string;
export type Cid = string;
export type Uri = string;
`;

function tsType(t: TypeRef): string {
  switch (t.kind) {
    case "primitive":
      switch (t.name) {
        case "string":
          return "string";
        case "integer":
          return "number";
        case "boolean":
          return "boolean";
        case "bytes":
          return "Uint8Array";
        case "blob":
          return "BlobRef";
        case "cid-link":
          return "CidLink";
        case "cid":
          return "Cid";
        case "datetime":
          return "DateTime";
        case "at-uri":
          return "AtUri";
        case "uri":
          return "Uri";
        case "at-identifier":
          return "AtIdentifier";
        case "did":
          return "Did";
      }
    case "array":
      return `${tsType(t.items)}[]`;
    case "ref":
      return t.targetId === "unknown" ? "unknown" : t.targetId;
    case "union":
      return t.options.length === 0 ? "unknown" : t.options.map((o) => (o === "unknown" ? "unknown" : o)).join(" | ");
    case "unknown":
      return "unknown";
  }
}

function jsdoc(desc?: string, indent = "  "): string {
  if (!desc) return "";
  const clean = desc.replace(/\*\//g, "*\\/").trim();
  return `${indent}/** ${clean} */\n`;
}

function emitInterface(t: NamedType): string {
  const head = jsdoc(t.description, "") + `export interface ${t.name} {\n`;
  const body = t.fields
    .map((f) => {
      const doc = jsdoc(f.description, "  ");
      const opt = f.required ? "" : "?";
      return `${doc}  ${f.name}${opt}: ${tsType(f.type)};`;
    })
    .join("\n");
  return head + body + "\n}\n";
}

export function emitTypescript(reg: Registry): string {
  const parts = [HEADER, ...reg.types.map(emitInterface)];
  return parts.join("\n");
}
