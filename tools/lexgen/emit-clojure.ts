import type { Registry, NamedType, TypeRef } from "./registry";

const HEADER = `;; AUTO-GENERATED FILE -- DO NOT EDIT.
;; Source: apps/api/lexicons/**/*.json
;; Regenerate via: bun run lexgen:types

(ns rocksky.generated.types)
`;

function cljPrim(name: string): string {
  switch (name) {
    case "string":
    case "datetime":
    case "at-uri":
    case "uri":
    case "at-identifier":
    case "did":
    case "cid":
    case "cid-link":
      return ":string";
    case "integer":
      return ":int";
    case "boolean":
      return ":boolean";
    case "bytes":
      return ":bytes";
    case "blob":
      return ":BlobRef";
    default:
      return ":any";
  }
}

function cljType(t: TypeRef): string {
  switch (t.kind) {
    case "primitive":
      return cljPrim(t.name);
    case "array":
      return `[:vector ${cljType(t.items)}]`;
    case "ref":
      return t.targetId === "unknown" ? ":any" : `:${t.targetId}`;
    case "union":
      if (t.options.length === 0) return ":any";
      return `[:or ${t.options.map((o) => (o === "unknown" ? ":any" : `:${o}`)).join(" ")}]`;
    case "unknown":
      return ":any";
  }
}

function emitEntry(t: NamedType, isFirst: boolean): string {
  const lines: string[] = [];
  if (t.description) lines.push(`   ;; ${t.description.replace(/\n/g, " ")}`);
  lines.push(`   :${t.name}`);
  if (t.fields.length === 0) {
    lines.push(`   [:map]`);
    return lines.join("\n");
  }
  lines.push(`   [:map`);
  for (const f of t.fields) {
    if (f.description) lines.push(`    ;; ${f.description.replace(/\n/g, " ")}`);
    const opt = f.required ? "" : "{:optional true} ";
    const fieldKey = `:${f.name}`;
    lines.push(`    [${fieldKey} ${opt}${cljType(f.type)}]`);
  }
  lines.push(`    ]`);
  return lines.join("\n");
}

export function emitClojure(reg: Registry): string {
  const entries = reg.types.map((t, i) => emitEntry(t, i === 0));
  const body = entries.join("\n");
  return `${HEADER}
(def ^{:doc "Lexicon-derived schemas in malli format. Refs are :TypeName keywords."}
  schemas
  {${body}
   })

(defn schema
  "Look up a generated schema by keyword."
  [k]
  (get schemas k))
`;
}
