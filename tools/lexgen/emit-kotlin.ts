import type { Registry, NamedType, TypeRef } from "./registry";

const HEADER = `// AUTO-GENERATED FILE — DO NOT EDIT.
// Source: apps/api/lexicons/**/*.json
// Regenerate via: bun run lexgen:types

package app.rocksky.generated

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

@Serializable
public data class BlobRef(
    @SerialName("\\$type") public val type: String? = null,
    public val ref: BlobCidRef? = null,
    @SerialName("mimeType") public val mimeType: String? = null,
    public val size: Int? = null,
)

@Serializable
public data class BlobCidRef(
    @SerialName("\\$link") public val link: String? = null,
)
`;

const KOTLIN_KEYWORDS = new Set([
  "as", "break", "class", "continue", "do", "else", "false", "for", "fun",
  "if", "in", "interface", "is", "null", "object", "package", "return",
  "super", "this", "throw", "true", "try", "typealias", "typeof", "val",
  "var", "when", "while",
]);

function kotlinField(name: string): string {
  if (KOTLIN_KEYWORDS.has(name)) return name + "_";
  return name;
}

function kotlinPrim(name: string): string {
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
      return "Boolean";
    case "bytes":
      return "ByteArray";
    case "blob":
      return "BlobRef";
    default:
      return "JsonElement";
  }
}

function kotlinType(t: TypeRef): string {
  switch (t.kind) {
    case "primitive":
      return kotlinPrim(t.name);
    case "array":
      return `List<${kotlinType(t.items)}>`;
    case "ref":
      return t.targetId === "unknown" ? "JsonElement" : t.targetId;
    case "union":
      return "JsonElement";
    case "unknown":
      return "JsonElement";
  }
}

function emitDataClass(t: NamedType): string {
  const lines: string[] = [];
  if (t.description) lines.push(`/** ${t.description.replace(/\*\//g, "*\\/").replace(/\n/g, " ")} */`);
  lines.push(`@Serializable`);
  if (t.fields.length === 0) {
    lines.push(`public class ${t.name}`);
    return lines.join("\n");
  }
  lines.push(`public data class ${t.name}(`);
  const fieldLines: string[] = [];
  const orderedFields = [...t.fields].sort((a, b) => Number(b.required) - Number(a.required));
  for (const f of orderedFields) {
    const safeName = kotlinField(f.name);
    const ty = kotlinType(f.type);
    const doc = f.description ? `    /** ${f.description.replace(/\*\//g, "*\\/").replace(/\n/g, " ")} */\n` : "";
    const ann = safeName !== f.name || /[A-Z]/.test(f.name) ? `@SerialName("${f.name}") ` : "";
    const nullable = f.required ? "" : "?";
    const defaultV = f.required ? "" : " = null";
    fieldLines.push(`${doc}    ${ann}public val ${safeName}: ${ty}${nullable}${defaultV},`);
  }
  lines.push(fieldLines.join("\n"));
  lines.push(`)`);
  return lines.join("\n");
}

export function emitKotlin(reg: Registry): string {
  return [HEADER, ...reg.types.map(emitDataClass)].join("\n\n") + "\n";
}
