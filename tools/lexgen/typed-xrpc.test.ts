import { describe, expect, test } from "bun:test";
import { emitGleam, emitGleamApi } from "./emit-gleam";
import {
  emitElixirApi,
  emitElixirModels,
  emitErlangApi,
  emitErlangHeader,
} from "./emit-beam-xrpc";
import { emitPythonApi, emitPythonModels } from "./emit-python-xrpc";
import type { Registry } from "./registry";

const registry: Registry = {
  refMap: new Map(),
  types: [
    {
      name: "Params",
      fields: [
        {
          name: "deviceId",
          required: true,
          type: { kind: "primitive", name: "string" },
        },
      ],
    },
    {
      name: "Body",
      fields: [
        {
          name: "ids",
          required: false,
          type: { kind: "array", items: { kind: "primitive", name: "string" } },
        },
      ],
    },
  ],
  endpoints: [
    {
      nsid: "app.rocksky.test.update",
      kind: "procedure",
      params: "Params",
      input: { kind: "ref", targetId: "Body" },
      output: { kind: "array", items: { kind: "ref", targetId: "Body" } },
    },
  ],
};

describe("typed SDK generation", () => {
  test("optional arrays preserve absence separately from an empty list", () => {
    expect(emitGleam(registry)).toContain("ids: Option(List(String))");
    expect(emitElixirModels(registry)).toContain("ids: [String.t()] | nil");
    expect(emitErlangHeader(registry)).toContain("[binary()] | undefined");
    expect(emitPythonModels(registry)).toContain(
      'ids: list[str] | None = Field(default=None, alias="ids")',
    );
  });
  test("procedures retain separate typed params and JSON bodies", () => {
    expect(emitGleamApi(registry)).toContain(
      "params: models.Params, input: models.Body",
    );
    expect(emitElixirApi(registry)).toContain(
      "Rocksky.Models.Params.encode(params), Rocksky.Models.Body.encode(input)",
    );
    expect(emitErlangApi(registry)).toContain(
      "rocksky_models:encode_params(Params), rocksky_models:encode_body(Input)",
    );
    expect(emitPythonApi(registry)).toContain(
      "params: models.Params, body: models.Body",
    );
    expect(emitPythonApi(registry)).toContain(
      "params=params.model_dump(by_alias=True, exclude_unset=True), body=body.model_dump(by_alias=True, exclude_unset=True)",
    );
  });
  test("required fields and array response types remain typed", () => {
    expect(emitGleam(registry)).toContain(
      'decode.field("deviceId", decode.string)',
    );
    expect(emitElixirModels(registry)).toContain("@enforce_keys [:device_id]");
    expect(emitPythonModels(registry)).toContain(
      'device_id: str = Field(alias="deviceId")',
    );
    expect(emitPythonApi(registry)).toContain("-> list[models.Body]");
    expect(emitErlangApi(registry)).toContain("{ok, [rocksky_models:body()]}");
  });
});
