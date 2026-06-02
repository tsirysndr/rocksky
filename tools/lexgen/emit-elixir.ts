import type { Registry, NamedType, TypeRef } from "./registry";

const HEADER = `# AUTO-GENERATED FILE -- DO NOT EDIT.
# Source: apps/api/lexicons/**/*.json
# Regenerate via: bun run lexgen:types

defmodule Rocksky.Generated.BlobRef do
  @moduledoc "atproto blob reference shape."
  @type t :: %__MODULE__{
          type: String.t() | nil,
          ref: map() | nil,
          mimeType: String.t() | nil,
          size: integer() | nil
        }
  defstruct [:type, :ref, :mimeType, :size]
end
`;

function exPrim(name: string): string {
  switch (name) {
    case "string":
    case "datetime":
    case "at-uri":
    case "uri":
    case "at-identifier":
    case "did":
    case "cid":
    case "cid-link":
      return "String.t()";
    case "integer":
      return "integer()";
    case "boolean":
      return "boolean()";
    case "bytes":
      return "binary()";
    case "blob":
      return "Rocksky.Generated.BlobRef.t()";
    default:
      return "term()";
  }
}

function exType(t: TypeRef): string {
  switch (t.kind) {
    case "primitive":
      return exPrim(t.name);
    case "array":
      return `list(${exType(t.items)})`;
    case "ref":
      return t.targetId === "unknown" ? "term()" : `Rocksky.Generated.${t.targetId}.t()`;
    case "union":
      return "term()";
    case "unknown":
      return "term()";
  }
}

function emitModule(t: NamedType): string {
  const lines: string[] = [];
  lines.push(`defmodule Rocksky.Generated.${t.name} do`);
  if (t.description) {
    lines.push(`  @moduledoc ${JSON.stringify(t.description)}`);
  } else {
    lines.push(`  @moduledoc false`);
  }
  if (t.fields.length === 0) {
    lines.push(`  @type t :: %__MODULE__{}`);
    lines.push(`  defstruct []`);
    lines.push(`end`);
    return lines.join("\n");
  }
  const required = t.fields.filter((f) => f.required);
  lines.push(`  @type t :: %__MODULE__{`);
  const fieldTypes = t.fields.map((f, i) => {
    const sep = i === t.fields.length - 1 ? "" : ",";
    const ty = exType(f.type) + (f.required ? "" : " | nil");
    return `          ${f.name}: ${ty}${sep}`;
  });
  lines.push(fieldTypes.join("\n"));
  lines.push(`        }`);
  const atomList = (names: string[]) => `[${names.map((n) => `:${n}`).join(", ")}]`;
  if (required.length > 0) {
    lines.push(`  @enforce_keys ${atomList(required.map((f) => f.name))}`);
  }
  lines.push(`  defstruct ${atomList(t.fields.map((f) => f.name))}`);
  lines.push(`end`);
  return lines.join("\n");
}

export function emitElixir(reg: Registry): string {
  return [HEADER, ...reg.types.map(emitModule)].join("\n\n") + "\n";
}
