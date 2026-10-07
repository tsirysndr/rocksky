import { normalizeNullableArrays } from "../scripts/nullableArrays";
import { schemaDict } from "../src/lexicon/lexicons";
import { describe, expect, test } from "bun:test";
import { Lexicons } from "@atproto/lexicon";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(dir, entry.name))
      : [join(dir, entry.name)],
  );
}
const docs = files(join(root, "lexicons"))
  .filter((p) => p.endsWith(".json"))
  .map((p) => JSON.parse(readFileSync(p, "utf8")));
const byId = new Map(docs.map((d) => [d.id, d]));
const lexicons = new Lexicons(docs);
const exceptions = JSON.parse(
  readFileSync(join(import.meta.dir, "xrpc-response-exceptions.json"), "utf8"),
);
function assertDocumented(
  schema: any,
  value: any,
  id: string,
  definition = "main",
) {
  if (schema.type === "ref") {
    const [base, key = "main"] = schema.ref.replace(/^lex:/, "").split("#");
    return assertDocumented(
      byId.get(base || id).defs[key],
      value,
      base || id,
      key,
    );
  }
  if (schema.type === "array" && Array.isArray(value)) {
    value.forEach((item) =>
      assertDocumented(schema.items, item, id, definition),
    );
  } else if (schema.type === "object" && value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (key === "$type") continue;
      const property = schema.properties?.[key];
      if (!property) {
        expect(
          exceptions.some(
            (e: any) =>
              e.lexicon === id &&
              e.definition === definition &&
              e.field === key,
          ),
        ).toBe(true);
      } else if (item !== null)
        assertDocumented(property, item, id, definition);
    }
  }
}

describe("XRPC response contracts", () => {
  test("nullable array generation makes the array nullable, not its elements", () => {
    expect(normalizeNullableArrays("genres?: (string | null)[];")).toBe(
      "genres?: (string)[] | null;",
    );
    expect(normalizeNullableArrays("genres?: string[];")).toBe(
      "genres?: string[];",
    );
  });
  test("registered runtime schemas match checked-in JSON lexicons", () => {
    function normalize(value: any): any {
      if (Array.isArray(value)) return value.map(normalize);
      if (value && typeof value === "object")
        return Object.fromEntries(
          Object.entries(value).map(([key, val]) => [key, normalize(val)]),
        );
      return typeof value === "string" && value.startsWith("lex:")
        ? value.slice(4)
        : value;
    }
    const runtime = new Map(
      Object.values(schemaDict).map((doc: any) => [doc.id, doc]),
    );
    for (const doc of docs)
      expect(normalize(runtime.get(doc.id))).toEqual(normalize(doc));
  });
  test("every implemented handler has a query or procedure definition", () => {
    const missing: string[] = [];
    for (const path of files(join(root, "src/xrpc"))) {
      if (!path.endsWith(".ts") || path.endsWith(".test.ts")) continue;
      const source = readFileSync(path, "utf8");
      for (const match of source.matchAll(
        /server\.(app\.rocksky\.[\w.]+)\(/g,
      )) {
        const type = byId.get(match[1])?.defs.main?.type;
        if (type !== "query" && type !== "procedure") missing.push(match[1]);
      }
    }
    expect(missing).toEqual([]);
  });
  test("all local references resolve", () => {
    const missing: string[] = [];
    function visit(value: any, id: string) {
      if (!value || typeof value !== "object") return;
      const refs =
        value.type === "ref"
          ? [value.ref]
          : value.type === "union"
            ? value.refs
            : [];
      for (const ref of refs) {
        const [base, key = "main"] = ref.replace(/^lex:/, "").split("#");
        const target = base || id;
        if (target.startsWith("app.rocksky.") && !byId.get(target)?.defs[key])
          missing.push(`${id} -> ${ref}`);
      }
      Object.values(value).forEach((v) => visit(v, id));
    }
    docs.forEach((d) => visit(d, d.id));
    expect(missing).toEqual([]);
  });
  const fixtureDir = resolve(root, "../../crates/appview/tests/fixtures");
  for (const file of files(fixtureDir).filter((f) => f.endsWith(".json"))) {
    const method = file
      .split("/")
      .at(-1)!
      .replace(/\.json$/, "");
    const matches = docs.filter(
      (d) =>
        d.id.endsWith(`.${method}`) && !d.id.startsWith("app.rocksky.library."),
    );
    if (matches.length !== 1) continue;
    const doc = matches[0];
    test(`${doc.id} accepts the existing production response fixture`, () => {
      const data = JSON.parse(readFileSync(file, "utf8"));
      const result = lexicons.assertValidXrpcOutput(doc.id, data);
      expect(result).toEqual(data);
      assertDocumented(doc.defs.main.output.schema, data, doc.id);
    });
  }
});
