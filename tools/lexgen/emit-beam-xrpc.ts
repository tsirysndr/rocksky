import type { Registry, TypeRef, NamedType } from "./registry";
import { gleamRegistry } from "./emit-gleam";
const snake = (s: string) =>
  s
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/^_+/, "");
const atom = (s: string) => `'${s.replaceAll("'", "\\'")}'`;
const bin = (s: string) => `<<${JSON.stringify(s)}>>`;
const blobs: NamedType[] = [
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
function desc(t: TypeRef): string {
  switch (t.kind) {
    case "array":
      return `{list, ${desc(t.items)}}`;
    case "ref":
      return t.targetId === "unknown"
        ? "json_value"
        : `{record, ${atom(snake(t.targetId))}}`;
    case "primitive":
      return (
        (
          {
            integer: "integer",
            float: "float",
            boolean: "boolean",
            blob: "{record, blob_ref}",
            bytes: "binary",
          } as Record<string, string>
        )[t.name] ?? "string"
      );
    default:
      return "json_value";
  }
}
function typ(t: TypeRef): string {
  switch (t.kind) {
    case "array":
      return `[${typ(t.items)}]`;
    case "ref":
      return t.targetId === "unknown"
        ? "json_value()"
        : `${snake(t.targetId)}()`;
    case "primitive":
      return (
        (
          {
            integer: "integer()",
            float: "float()",
            boolean: "boolean()",
            blob: "blob_ref()",
            bytes: "binary()",
          } as Record<string, string>
        )[t.name] ?? "binary()"
      );
    default:
      return "json_value()";
  }
}
const all = (r: Registry) => [...blobs, ...gleamRegistry(r).types];
export function emitErlangHeader(r: Registry): string {
  return (
    `%% Generated from lexicons. Regenerate: bun tools/lexgen/generate.ts --erlang
-ifndef(ROCKSKY_MODELS_HRL).
-define(ROCKSKY_MODELS_HRL, true).
-type json_value() :: null | boolean() | integer() | float() | binary() | [json_value()] | #{binary() => json_value()}.
` +
    all(r)
      .map(
        (t) =>
          `-record(${snake(t.name)}, {${t.fields.map((f) => `${atom(snake(f.name))} = undefined :: ${typ(f.type)} | undefined`).join(", ")}}).\n-type ${snake(t.name)}() :: #${snake(t.name)}{}.`,
      )
      .join("\n") +
    "\n-endif.\n"
  );
}
export function emitErlangModels(r: Registry): string {
  const types = all(r);
  return (
    `%% Generated from lexicons.
-module(rocksky_models).
-include("rocksky_models.hrl").
-export([schema/1, ${types.flatMap((t) => [`decode_${snake(t.name)}/1`, `encode_${snake(t.name)}/1`]).join(", ")}]).
-export_type([json_value/0, ${types.map((t) => `${snake(t.name)}/0`).join(", ")}]).
` +
    types
      .map(
        (t) =>
          `schema(${atom(snake(t.name))}) -> [${t.fields.map((f) => `{${bin(f.name)}, ${atom(snake(f.name))}, ${!!f.required}, ${!!f.nullable}, ${desc(f.type)}}`).join(", ")}]`,
      )
      .join(";\n") +
    ".\n" +
    types
      .map(
        (
          t,
        ) => `-spec decode_${snake(t.name)}(map()) -> {ok, ${snake(t.name)}()} | {error, term()}.
decode_${snake(t.name)}(Value) -> rocksky_typed_codec:decode(${atom(snake(t.name))}, Value).
-spec encode_${snake(t.name)}(${snake(t.name)}()) -> map().
encode_${snake(t.name)}(Value) -> rocksky_typed_codec:encode(${atom(snake(t.name))}, Value).
`,
      )
      .join("\n")
  );
}
function remoteType(t: TypeRef): string {
  return typ(t).replace(/\b([a-z_]+)\(\)/g, (m, n) =>
    ["binary", "integer", "float", "boolean"].includes(n)
      ? m
      : `rocksky_models:${m}`,
  );
}
export function emitErlangApi(r: Registry): string {
  const eps = r.endpoints.filter((e) => e.kind !== "subscription");
  return (
    `%% Generated endpoint functions; raw/5 is the escape hatch.
-module(rocksky_xrpc).
-export([new/0, with_endpoint/2, with_token/2, with_timeout/2, raw/5, ${eps.map((e) => `${snake(e.nsid.replace("app.rocksky.", "").replaceAll(".", "_"))}/${1 + Number(!!e.params) + Number(!!e.input)}`).join(", ")}]).
-export_type([client/0, error/0]).
-opaque client() :: #{endpoint := binary(), token := binary(), timeout := pos_integer()}.
-type error() :: {transport, binary()} | {http, integer(), binary()} | {decode, term()}.
-spec new() -> client().
new() -> #{endpoint => <<"https://api.rocksky.app">>, token => <<>>, timeout => 30000}.
-spec with_endpoint(client(), binary()) -> client().
with_endpoint(Client, Endpoint) -> Client#{endpoint => Endpoint}.
-spec with_token(client(), binary()) -> client().
with_token(Client, Token) -> Client#{token => Token}.
-spec with_timeout(client(), pos_integer()) -> client().
with_timeout(Client, Timeout) -> Client#{timeout => Timeout}.
-spec raw(client(), get | post, binary(), map(), rocksky_models:json_value() | undefined) -> {ok, {integer(), binary()}} | {error, error()}.
raw(Client, Method, Nsid, Params, Body) ->
  BodyJson = case Body of undefined -> <<>>; _ -> iolist_to_binary(json:encode(Body)) end,
  case rocksky_xrpc_http:request(Method, maps:get(endpoint, Client), Nsid, iolist_to_binary(json:encode(Params)), BodyJson, maps:get(token, Client), maps:get(timeout, Client)) of
    {ok, Response} -> {ok, Response};
    {error, Reason} -> {error, {transport, Reason}}
  end.
call(Client, Method, Nsid, Params, Body, Output) ->
  case raw(Client, Method, Nsid, Params, Body) of
    {ok, {Status, Bytes}} when Status >= 200, Status < 300 ->
      try case Output of
        binary -> {ok, Bytes};
        none -> {ok, nil};
        _ -> rocksky_typed_codec:decode_value(Output, json:decode(Bytes))
      end catch _:Reason -> {error, {decode, Reason}} end;
    {ok, {Status, Bytes}} -> {error, {http, Status, Bytes}};
    Error -> Error
  end.
` +
    eps
      .map((e) => {
        const name = snake(
          e.nsid.replace("app.rocksky.", "").replaceAll(".", "_"),
        );
        const args = [
          "Client",
          ...(e.params ? ["Params"] : []),
          ...(e.input ? ["Input"] : []),
        ];
        const types = [
          "client()",
          ...(e.params ? [`rocksky_models:${snake(e.params)}()`] : []),
          ...(e.input ? [remoteType(e.input)] : []),
        ];
        const output = e.binaryOutput
          ? "binary()"
          : e.output
            ? remoteType(e.output)
            : "nil";
        const encode = (t: TypeRef, v: string) =>
          t.kind === "ref"
            ? `rocksky_models:encode_${snake(t.targetId)}(${v})`
            : v;
        return `-spec ${name}(${types.join(", ")}) -> {ok, ${output}} | {error, error()}.
${name}(${args.join(", ")}) -> call(Client, ${e.kind === "query" ? "get" : "post"}, ${bin(e.nsid)}, ${e.params ? `rocksky_models:encode_${snake(e.params)}(Params)` : "#{}"}, ${e.input ? encode(e.input, "Input") : "undefined"}, ${e.binaryOutput ? "binary" : e.output ? desc(e.output) : "none"}).`;
      })
      .join("\n\n") +
    "\n"
  );
}
function exDesc(t: TypeRef): string {
  switch (t.kind) {
    case "array":
      return `{:list, ${exDesc(t.items)}}`;
    case "ref":
      return t.targetId === "unknown"
        ? ":json_value"
        : `{:record, Rocksky.Models.${t.targetId}}`;
    case "primitive":
      return (
        (
          {
            integer: ":integer",
            float: ":float",
            boolean: ":boolean",
            blob: "{:record, Rocksky.Models.BlobRef}",
            bytes: ":binary",
          } as Record<string, string>
        )[t.name] ?? ":string"
      );
    default:
      return ":json_value";
  }
}
function exTyp(t: TypeRef): string {
  switch (t.kind) {
    case "array":
      return `[${exTyp(t.items)}]`;
    case "ref":
      return t.targetId === "unknown"
        ? "Rocksky.Codec.json_value()"
        : `Rocksky.Models.${t.targetId}.t()`;
    case "primitive":
      return (
        (
          {
            integer: "integer()",
            float: "float()",
            boolean: "boolean()",
            blob: "Rocksky.Models.BlobRef.t()",
            bytes: "binary()",
          } as Record<string, string>
        )[t.name] ?? "String.t()"
      );
    default:
      return "Rocksky.Codec.json_value()";
  }
}
export function emitElixirModels(r: Registry): string {
  return (
    "# Generated from lexicons.\n" +
    all(r)
      .map(
        (t) => `defmodule Rocksky.Models.${t.name} do
  @enforce_keys [${t.fields
    .filter((f) => f.required)
    .map((f) => `:${snake(f.name)}`)
    .join(", ")}]
  defstruct [${t.fields.map((f) => `:${snake(f.name)}`).join(", ")}]
  @type t :: %__MODULE__{${t.fields.map((f) => `${snake(f.name)}: ${exTyp(f.type)}${!f.required || f.nullable ? " | nil" : ""}`).join(", ")}}
  def __schema__, do: [${t.fields.map((f) => `{${JSON.stringify(f.name)}, :${snake(f.name)}, ${!!f.required}, ${!!f.nullable}, ${exDesc(f.type)}}`).join(", ")}]
  @spec decode(map()) :: {:ok, t()} | {:error, term()}
  def decode(value), do: Rocksky.Codec.decode(__MODULE__, value)
  @spec encode(t()) :: map()
  def encode(value), do: Rocksky.Codec.encode(__MODULE__, value)
end
`,
      )
      .join("\n")
  );
}
export function emitElixirApi(r: Registry): string {
  return (
    `# Generated from lexicons. Raw transport: Rocksky.Xrpc.raw/5.
defmodule Rocksky.Api do
` +
    r.endpoints
      .filter((e) => e.kind !== "subscription")
      .map((e) => {
        const name = snake(
          e.nsid.replace("app.rocksky.", "").replaceAll(".", "_"),
        );
        const args = [
          "client",
          ...(e.params ? ["params"] : []),
          ...(e.input ? ["input"] : []),
        ];
        const types = [
          "Rocksky.Xrpc.t()",
          ...(e.params ? [`Rocksky.Models.${e.params}.t()`] : []),
          ...(e.input ? [exTyp(e.input)] : []),
        ];
        return `  @spec ${name}(${types.join(", ")}) :: {:ok, ${e.binaryOutput ? "binary()" : e.output ? exTyp(e.output) : "nil"}} | {:error, term()}
  def ${name}(${args.join(", ")}) do
    Rocksky.Xrpc.request(client, :${e.kind === "query" ? "get" : "post"}, ${JSON.stringify(e.nsid)}, ${e.params ? `Rocksky.Models.${e.params}.encode(params)` : "%{}"}, ${e.input && e.input.kind === "ref" ? `Rocksky.Models.${e.input.targetId}.encode(input)` : "nil"}, ${e.binaryOutput ? ":binary" : e.output ? exDesc(e.output) : ":none"})
  end
`;
      })
      .join("\n") +
    "end\n"
  );
}
