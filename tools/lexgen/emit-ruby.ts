import type { Registry, NamedType, TypeRef } from "./registry";

const HEADER = `# frozen_string_literal: true
# AUTO-GENERATED FILE -- DO NOT EDIT.
# Source: apps/api/lexicons/**/*.json
# Regenerate via: bun run lexgen:types

module Rocksky
  module Generated
    BlobRef = Struct.new(:type, :ref, :mimeType, :size, keyword_init: true)
`;

const FOOTER = `  end
end
`;

function commentLines(s: string, indent: string): string {
  return s.split(/\n/).map((line) => `${indent}# ${line}`).join("\n");
}

function fieldList(t: NamedType): string {
  return t.fields.map((f) => `:${f.name}`).join(", ");
}

function emitStruct(t: NamedType): string {
  const lines: string[] = [];
  if (t.description) lines.push(commentLines(t.description, "    "));
  if (t.fields.length === 0) {
    lines.push(`    ${t.name} = Struct.new(keyword_init: true)`);
    return lines.join("\n");
  }
  const fields = fieldList(t);
  lines.push(`    ${t.name} = Struct.new(${fields}, keyword_init: true)`);
  return lines.join("\n");
}

export function emitRuby(reg: Registry): string {
  void (null as unknown as TypeRef);
  return [HEADER, ...reg.types.map(emitStruct), FOOTER].join("\n");
}
