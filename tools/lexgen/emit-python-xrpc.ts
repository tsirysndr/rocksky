import type { Registry, TypeRef } from "./registry";
import { gleamRegistry } from "./emit-gleam";
const snake = (s: string) =>
  s
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/^_+/, "");
const field = (s: string) =>
  [
    "from",
    "class",
    "type",
    "in",
    "is",
    "as",
    "if",
    "else",
    "None",
    "True",
    "False",
  ].includes(snake(s))
    ? snake(s) + "_"
    : snake(s);
function typ(t: TypeRef, prefix = ""): string {
  switch (t.kind) {
    case "primitive":
      return (
        (
          {
            integer: "int",
            float: "float",
            boolean: "bool",
            bytes: "bytes",
            blob: prefix + "BlobRef",
          } as Record<string, string>
        )[t.name] ?? "str"
      );
    case "array":
      return `list[${typ(t.items, prefix)}]`;
    case "ref":
      return t.targetId === "unknown" ? "JsonValue" : prefix + t.targetId;
    case "union":
      return t.options.includes("unknown")
        ? "JsonValue"
        : t.options.map((x) => prefix + x).join(" | ");
    default:
      return "JsonValue";
  }
}
export function emitPythonModels(reg: Registry): string {
  reg = gleamRegistry(reg);
  return (
    `# Generated from lexicons. Regenerate: bun tools/lexgen/generate.ts --python
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, JsonValue


class RockskyModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow", strict=True)

class BlobRef(RockskyModel):
    type_: str = Field(alias="$type")
    ref: dict[str, str]
    mime_type: str = Field(alias="mimeType")
    size: int

` +
    reg.types
      .map(
        (t) =>
          `class ${t.name}(RockskyModel):\n` +
          (t.fields.length
            ? t.fields
                .map(
                  (f) =>
                    `    ${field(f.name)}: ${typ(f.type)}${!f.required || f.nullable ? " | None" : ""} = Field(${!f.required ? "default=None, " : ""}alias=${JSON.stringify(f.name)})`,
                )
                .join("\n")
            : "    pass"),
      )
      .join("\n\n") +
    "\n\n" +
    reg.types.map((t) => `${t.name}.model_rebuild()`).join("\n") +
    "\n"
  );
}
export function emitPythonApi(reg: Registry): string {
  return (
    `# Generated from lexicons. Regenerate: bun tools/lexgen/generate.ts --python
from __future__ import annotations

from pydantic import TypeAdapter

from . import models
from .xrpc import XrpcTransport


class XrpcClient(XrpcTransport):
    """Typed XRPC endpoints. Use raw() for status, headers and response bytes."""
` +
    reg.endpoints
      .filter((e) => e.kind !== "subscription")
      .map((e) => {
        const args = ["self"];
        if (e.params) args.push(`params: models.${e.params}`);
        if (e.input) args.push(`body: ${typ(e.input, "models.")}`);
        const out = e.binaryOutput
          ? "bytes"
          : e.output
            ? typ(e.output, "models.")
            : "None";
        return `    def ${snake(e.nsid.replace("app.rocksky.", "").replaceAll(".", "_"))}(${args.join(", ")}) -> ${out}:
        response = self.raw(${JSON.stringify(e.kind === "query" ? "GET" : "POST")}, ${JSON.stringify(e.nsid)}, params=${e.params ? "params.model_dump(by_alias=True, exclude_unset=True)" : "None"}, body=${e.input ? "body.model_dump(by_alias=True, exclude_unset=True)" : "None"})
        response.raise_for_status()
        ${e.binaryOutput ? "return response.body" : e.output ? `return TypeAdapter(${out}).validate_json(response.body)` : "return None"}
`;
      })
      .join("\n")
  );
}
