import type { Registry, NamedType, TypeRef, Field } from "./registry";
import { readFileSync } from "node:fs";

const header = `// AUTO-GENERATED from apps/api/lexicons. Do not edit.
// Regenerate: bun tools/lexgen/generate.ts --gleam
`;
const keywords = new Set([
  "as",
  "assert",
  "case",
  "const",
  "external",
  "fn",
  "if",
  "import",
  "let",
  "opaque",
  "panic",
  "pub",
  "todo",
  "type",
  "use",
  "echo",
]);
const snake = (s: string) =>
  s
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/^_+/, "");
const field = (s: string) =>
  keywords.has(snake(s)) ? snake(s) + "_" : snake(s);
const quoted = (s: string) => JSON.stringify(s);
const optional = (f: Field) => !f.required || f.nullable;
const primitives: Record<string, string> = {
  integer: "Int",
  float: "Float",
  boolean: "Bool",
  bytes: "BitArray",
  blob: "BlobRef",
};
function type(t: TypeRef): string {
  switch (t.kind) {
    case "primitive":
      return primitives[t.name] ?? "String";
    case "array":
      return `List(${type(t.items)})`;
    case "ref":
      return t.targetId === "unknown" ? "json_value.JsonValue" : t.targetId;
    default:
      return "json_value.JsonValue";
  }
}
function decoder(t: TypeRef): string {
  switch (t.kind) {
    case "primitive":
      return (
        (
          {
            integer: "decode.int",
            float: "float_decoder()",
            boolean: "decode.bool",
            bytes: "decode.bit_array",
            blob: "blob_ref_decoder()",
          } as Record<string, string>
        )[t.name] ?? "decode.string"
      );
    case "array":
      return `decode.list(${decoder(t.items)})`;
    case "ref":
      return t.targetId === "unknown"
        ? "json_value.decoder()"
        : `${snake(t.targetId)}_decoder()`;
    default:
      return "json_value.decoder()";
  }
}
function encode(t: TypeRef, v: string): string {
  switch (t.kind) {
    case "primitive":
      return `${({ integer: "json.int", float: "json.float", boolean: "json.bool", blob: "encode_blob_ref", bytes: "json_value.encode_bytes" } as Record<string, string>)[t.name] ?? "json.string"}(${v})`;
    case "array":
      return `json.array(${v}, fn(item) { ${encode(t.items, "item")} })`;
    case "ref":
      return t.targetId === "unknown"
        ? `json_value.encode(${v})`
        : `encode_${snake(t.targetId)}(${v})`;
    default:
      return `json_value.encode(${v})`;
  }
}
const blobTypes: NamedType[] = [
  {
    name: "BlobCidRef",
    fields: [
      {
        name: "$link",
        required: true,
        type: { kind: "primitive", name: "string" },
      },
    ],
  },
  {
    name: "BlobRef",
    fields: [
      {
        name: "$type",
        required: true,
        type: { kind: "primitive", name: "string" },
      },
      {
        name: "ref",
        required: true,
        type: { kind: "ref", targetId: "BlobCidRef" },
      },
      {
        name: "mimeType",
        required: true,
        type: { kind: "primitive", name: "string" },
      },
      {
        name: "size",
        required: true,
        type: { kind: "primitive", name: "integer" },
      },
    ],
  },
];
export function gleamRegistry(reg: Registry): Registry {
  const types = structuredClone(reg.types);
  // Lexicon has no float primitive. These fields are open extensions on the wire.
  const exceptions = JSON.parse(
    readFileSync(
      new URL(
        "../../apps/api/tests/xrpc-response-exceptions.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  for (const e of exceptions) {
    const name = reg.refMap.get(`${e.lexicon}#${e.definition}`);
    const t = types.find((t) => t.name === name);
    if (!t || t.fields.some((f) => f.name === e.field)) continue;
    t.fields.push({
      name: e.field,
      required: false,
      type:
        e.field === "updatedAt"
          ? { kind: "unknown" }
          : ({ kind: "primitive", name: "float" } as TypeRef),
    });
  }
  return { ...reg, types };
}
function emitType(t: NamedType): string {
  const args = t.fields.map(
    (f) =>
      `${field(f.name)}: ${optional(f) ? `Option(${type(f.type)})` : type(f.type)}`,
  );
  const required = t.fields.filter((f) => f.required && !f.nullable);
  const construct = (defaulted = false) =>
    t.fields.length
      ? `${t.name}(${t.fields.map((f) => `${field(f.name)}: ${defaulted && optional(f) ? "None" : field(f.name)}`).join(", ")})`
      : t.name;
  return `pub type ${t.name} {\n  ${t.fields.length ? `${t.name}(${args.join(", ")})` : t.name}\n}

/// Construct with required fields; optional fields default to None.
pub fn new_${snake(t.name)}(${required.map((f) => `${field(f.name)}: ${type(f.type)}`).join(", ")}) -> ${t.name} {
  ${construct(true)}
}

pub fn ${snake(t.name)}_decoder() -> decode.Decoder(${t.name}) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
${t.fields.map((f) => `  use ${field(f.name)} <- ${f.required ? `decode.field(${quoted(f.name)}, ${f.nullable ? `decode.optional(${decoder(f.type)})` : decoder(f.type)})` : `decode.optional_field(${quoted(f.name)}, None, decode.optional(${decoder(f.type)}))`}`).join("\n")}
  decode.success(${construct()})
}

pub fn encode_${snake(t.name)}(${t.fields.length ? "value" : "_value"}: ${t.name}) -> json.Json {
  json.object(list.flatten([
${t.fields.map((f) => (optional(f) ? `    case value.${field(f.name)} { Some(v) -> [#(${quoted(f.name)}, ${encode(f.type, "v")})] None -> ${f.required ? `[#(${quoted(f.name)}, json.null())]` : "[]"} },` : `    [#(${quoted(f.name)}, ${encode(f.type, `value.${field(f.name)}`)})],`)).join("\n")}
  ]))
}`;
}
export function emitGleam(reg: Registry): string {
  reg = gleamRegistry(reg);
  return (
    header +
    `
import gleam/dynamic/decode
import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/int
import rocksky/json_value

fn float_decoder() -> decode.Decoder(Float) {
  decode.one_of(decode.float, [decode.int |> decode.map(int.to_float)])
}

` +
    [...blobTypes, ...reg.types].map(emitType).join("\n\n") +
    "\n"
  );
}
function qualified(t: TypeRef): string {
  switch (t.kind) {
    case "ref":
      return t.targetId === "unknown"
        ? "json_value.JsonValue"
        : `models.${t.targetId}`;
    case "array":
      return `List(${qualified(t.items)})`;
    default:
      return type(t);
  }
}
export function emitGleamApi(reg: Registry): string {
  return (
    header +
    `
import gleam/dynamic/decode
import gleam/json
import gleam/option.{None, Some}
import rocksky/models
import rocksky/xrpc

` +
    reg.endpoints
      .filter((e) => e.kind !== "subscription")
      .map((e) => {
        const args = ["client: xrpc.Client"];
        if (e.params) args.push(`params: models.${e.params}`);
        if (e.input) args.push(`input: ${qualified(e.input)}`);
        const method = e.kind === "query" ? "Get" : "Post";
        const params = e.params
          ? `models.encode_${snake(e.params)}(params)`
          : "json.object([])";
        const input = e.input
          ? `Some(${encode(e.input, "input").replace(/\bencode_/g, "models.encode_")})`
          : "None";
        const output = e.binaryOutput
          ? "BitArray"
          : e.output
            ? qualified(e.output)
            : "Nil";
        const dec = e.output
          ? decoder(e.output).replace(/\b(\w+_decoder)\(/g, "models.$1(")
          : "decode.success(Nil)";
        return `/// ${e.nsid}
pub fn ${snake(e.nsid.replace("app.rocksky.", "").replaceAll(".", "_"))}(${args.join(", ")}) -> Result(${output}, xrpc.Error) {
  xrpc.${e.binaryOutput ? "request_bytes" : "request"}(client, xrpc.${method}, ${quoted(e.nsid)}, ${params}, ${input}${e.binaryOutput ? "" : `, ${dec}`})
}`;
      })
      .join("\n\n") +
    "\n"
  );
}
