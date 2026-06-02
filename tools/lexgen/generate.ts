#!/usr/bin/env bun
import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createConsola } from "consola";

import { emitTypescript } from "./emit-typescript";
import { emitGo } from "./emit-go";
import { emitPython } from "./emit-python";
import { emitPythonPydantic } from "./emit-python-pydantic";
import { emitRust } from "./emit-rust";
import { emitKotlin } from "./emit-kotlin";
import { emitRuby } from "./emit-ruby";
import { emitElixir } from "./emit-elixir";
import { emitClojure } from "./emit-clojure";
import { emitGleam } from "./emit-gleam";

import type { Registry, NamedType, Field, TypeRef } from "./registry";

const log = createConsola({
  level: 4,
  formatOptions: { date: false, colors: true, compact: false },
});
const tag = (name: string) => log.withTag(name);

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const LEX_DIR = join(REPO, "apps", "api", "lexicons");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (name.endsWith(".json")) out.push(p);
  }
  return out;
}

function pascal(s: string): string {
  return s
    .replace(/[^A-Za-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join("");
}

function nsidNs(nsid: string): string {
  const segs = nsid.split(".");
  let last = segs[segs.length - 1];
  if ((last === "defs" || last === "def") && segs.length >= 2) {
    last = segs[segs.length - 2];
  }
  return pascal(last);
}

function typeNameFor(
  nsid: string,
  defName: string,
  kind: "record" | "object" | "params",
  mainSuffix?: string,
): string {
  const ns = nsidNs(nsid);
  if (defName === "main") {
    if (kind === "record") return ns + "Record";
    if (kind === "params") return ns + (mainSuffix ?? "Params");
    return ns + (mainSuffix ?? "");
  }
  const dn = pascal(defName);
  return dn.toLowerCase().startsWith(ns.toLowerCase()) ? dn : ns + dn;
}

function resolveRef(currentNsid: string, ref: string): { nsid: string; def: string } {
  const [maybeNsid, defPart] = ref.split("#");
  const nsid = maybeNsid && maybeNsid.length > 0 ? maybeNsid : currentNsid;
  const def = defPart && defPart.length > 0 ? defPart : "main";
  return { nsid, def };
}

const FORMAT_PRIM: Record<string, TypeRef> = {
  datetime: { kind: "primitive", name: "datetime" },
  "at-uri": { kind: "primitive", name: "at-uri" },
  uri: { kind: "primitive", name: "uri" },
  "at-identifier": { kind: "primitive", name: "at-identifier" },
  did: { kind: "primitive", name: "did" },
  cid: { kind: "primitive", name: "cid" },
  handle: { kind: "primitive", name: "at-identifier" },
};

interface ParseCtx {
  nsid: string;
  parentTypeName: string;
  hoist: (name: string, t: NamedType) => void;
  refs: Set<string>;
  refMap: Map<string, string>;
}

function parseTypeRef(node: any, ctx: ParseCtx, fieldNameForHoist?: string): TypeRef {
  if (!node || typeof node !== "object") return { kind: "unknown" };
  switch (node.type) {
    case "string": {
      if (node.knownValues && Array.isArray(node.knownValues)) {
        return { kind: "primitive", name: "string" };
      }
      if (node.format && FORMAT_PRIM[node.format]) {
        return FORMAT_PRIM[node.format];
      }
      return { kind: "primitive", name: "string" };
    }
    case "integer":
      return { kind: "primitive", name: "integer" };
    case "boolean":
      return { kind: "primitive", name: "boolean" };
    case "bytes":
      return { kind: "primitive", name: "bytes" };
    case "blob":
      return { kind: "primitive", name: "blob" };
    case "cid-link":
      return { kind: "primitive", name: "cid-link" };
    case "unknown":
      return { kind: "unknown" };
    case "array":
      return { kind: "array", items: parseTypeRef(node.items, ctx, fieldNameForHoist) };
    case "ref": {
      const r = resolveRef(ctx.nsid, node.ref);
      const id = `${r.nsid}#${r.def}`;
      ctx.refs.add(id);
      return { kind: "ref", targetId: id };
    }
    case "union": {
      const ids: string[] = [];
      for (const ref of node.refs ?? []) {
        const r = resolveRef(ctx.nsid, ref);
        const id = `${r.nsid}#${r.def}`;
        ctx.refs.add(id);
        ids.push(id);
      }
      return { kind: "union", options: ids };
    }
    case "object": {
      const hoistName = ctx.parentTypeName + (fieldNameForHoist ? pascal(fieldNameForHoist) : "Object");
      const nested = buildNamedType(hoistName, node, ctx);
      ctx.hoist(hoistName, nested);
      return { kind: "ref", targetId: `__inline:${hoistName}` };
    }
    default:
      return { kind: "unknown" };
  }
}

function buildNamedType(name: string, node: any, ctx: ParseCtx): NamedType {
  const required: string[] = node.required ?? [];
  const fields: Field[] = [];
  const props = node.properties ?? {};
  for (const [propName, propNode] of Object.entries<any>(props)) {
    const childCtx: ParseCtx = { ...ctx, parentTypeName: name };
    const t = parseTypeRef(propNode, childCtx, propName);
    fields.push({
      name: propName,
      description: propNode.description,
      required: required.includes(propName),
      type: t,
    });
  }
  return { name, description: node.description, fields };
}

function buildRegistry(): Registry {
  const files = walk(LEX_DIR).sort();
  const types: NamedType[] = [];
  const refMap = new Map<string, string>();
  const refs = new Set<string>();

  const hoist = (name: string, t: NamedType) => {
    if (!types.find((x) => x.name === name)) types.push(t);
  };

  const recordDef = (nsid: string, defName: string, name: string) => {
    refMap.set(`${nsid}#${defName}`, name);
  };

  for (const f of files) {
    const raw = readFileSync(f, "utf8");
    let doc: any;
    try {
      doc = JSON.parse(raw);
    } catch {
      continue;
    }
    const nsid: string = doc.id;
    if (!nsid) continue;
    const defs = doc.defs ?? {};
    for (const [defName, def] of Object.entries<any>(defs)) {
      const baseCtx = { nsid, refs, refMap };
      switch (def.type) {
        case "record": {
          const name = typeNameFor(nsid, defName, "record");
          recordDef(nsid, defName, name);
          const ctx: ParseCtx = { ...baseCtx, parentTypeName: name, hoist };
          const t = buildNamedType(name, def.record ?? {}, ctx);
          types.push(t);
          break;
        }
        case "object": {
          const name = typeNameFor(nsid, defName, "object");
          recordDef(nsid, defName, name);
          const ctx: ParseCtx = { ...baseCtx, parentTypeName: name, hoist };
          const t = buildNamedType(name, def, ctx);
          types.push(t);
          break;
        }
        case "query":
        case "procedure":
        case "subscription": {
          const paramsName = typeNameFor(nsid, "main", "params", "Params");
          if (def.parameters && def.parameters.properties) {
            const ctx: ParseCtx = { ...baseCtx, parentTypeName: paramsName, hoist };
            const t = buildNamedType(paramsName, def.parameters, ctx);
            types.push(t);
          }
          if (def.type === "procedure" && def.input?.schema?.type === "object") {
            const name = nsidNs(nsid) + "Input";
            const ctx: ParseCtx = { ...baseCtx, parentTypeName: name, hoist };
            const t = buildNamedType(name, def.input.schema, ctx);
            types.push(t);
          }
          if (def.output?.schema?.type === "object") {
            const name = nsidNs(nsid) + "Output";
            const ctx: ParseCtx = { ...baseCtx, parentTypeName: name, hoist };
            const t = buildNamedType(name, def.output.schema, ctx);
            types.push(t);
          }
          if (def.message?.schema?.type === "object") {
            const name = nsidNs(nsid) + "Message";
            const ctx: ParseCtx = { ...baseCtx, parentTypeName: name, hoist };
            const t = buildNamedType(name, def.message.schema, ctx);
            types.push(t);
          }
          break;
        }
        default:
          break;
      }
    }
  }

  for (const t of types) {
    if (t.name.startsWith("__inline:")) continue;
    refMap.set(`__inline:${t.name}`, t.name);
  }

  for (const t of types) {
    for (const f of t.fields) f.type = resolveTypeRef(f.type, refMap);
  }

  const seen = new Map<string, NamedType>();
  for (const t of types) {
    if (!seen.has(t.name)) seen.set(t.name, t);
  }
  const deduped = Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));

  return { types: deduped, refMap };
}

function resolveTypeRef(t: TypeRef, refMap: Map<string, string>): TypeRef {
  switch (t.kind) {
    case "array":
      return { kind: "array", items: resolveTypeRef(t.items, refMap) };
    case "ref": {
      const name = refMap.get(t.targetId) ?? "unknown";
      return { kind: "ref", targetId: name };
    }
    case "union": {
      const opts = t.options.map((id) => refMap.get(id) ?? "unknown");
      return { kind: "union", options: opts };
    }
    default:
      return t;
  }
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function writeOut(langLog: ReturnType<typeof tag>, p: string, content: string) {
  mkdirSync(dirname(p), { recursive: true });
  const existed = existsSync(p);
  writeFileSync(p, content, "utf8");
  const rel = p.replace(REPO + "/", "");
  const verb = existed ? "updated" : "created";
  langLog.success(`${verb} \`${rel}\` (${fmtBytes(content.length)})`);
}

const LANG_ICONS: Record<string, string> = {
  typescript: "TS",
  go: "GO",
  python: "PY",
  "python-pydantic": "PYD",
  rust: "RS",
  kotlin: "KT",
  ruby: "RB",
  elixir: "EX",
  clojure: "CLJ",
  gleam: "GLM",
};

async function main() {
  const t0 = Date.now();
  log.box({
    title: "rocksky · lexgen",
    message: "generating SDK type bindings from atproto lexicons",
    style: { borderColor: "magenta", padding: 1 },
  });

  const parseLog = tag("parse");
  parseLog.start(`scanning ${LEX_DIR.replace(REPO + "/", "")}`);
  const reg = buildRegistry();
  parseLog.success(`parsed ${reg.types.length} named types`);

  const targets = [
    { lang: "typescript", path: join(REPO, "sdk/typescript/src/generated/types.ts"), fn: emitTypescript },
    { lang: "go", path: join(REPO, "sdk/go/rocksky/gen/types.go"), fn: emitGo },
    { lang: "python", path: join(REPO, "sdk/python/src/rocksky/gen/types.py"), fn: emitPython },
    { lang: "python-pydantic", path: join(REPO, "sdk/python/src/rocksky/gen/models.py"), fn: emitPythonPydantic },
    { lang: "rust", path: join(REPO, "sdk/rust/src/generated.rs"), fn: emitRust },
    { lang: "kotlin", path: join(REPO, "sdk/kotlin/rocksky/src/main/kotlin/app/rocksky/generated/Types.kt"), fn: emitKotlin },
    { lang: "ruby", path: join(REPO, "sdk/ruby/lib/rocksky/generated/types.rb"), fn: emitRuby },
    { lang: "elixir", path: join(REPO, "sdk/elixir/lib/rocksky/generated/types.ex"), fn: emitElixir },
    { lang: "clojure", path: join(REPO, "sdk/clojure/src/rocksky/generated/types.clj"), fn: emitClojure },
    { lang: "gleam", path: join(REPO, "sdk/gleam/src/rocksky/generated/types.gleam"), fn: emitGleam },
  ];

  let totalBytes = 0;
  for (const t of targets) {
    const langLog = tag(`${LANG_ICONS[t.lang] ?? t.lang}`);
    langLog.start(`emitting ${t.lang}`);
    const content = t.fn(reg);
    totalBytes += content.length;
    writeOut(langLog, t.path, content);
  }

  const pyLog = tag("PY");
  const initPy = join(REPO, "sdk/python/src/rocksky/gen/__init__.py");
  const initContent = "from .types import *  # noqa: F401,F403\n";
  totalBytes += initContent.length;
  writeOut(pyLog, initPy, initContent);

  const ms = Date.now() - t0;
  log.box({
    title: "done",
    message: [
      `${reg.types.length} types  ·  ${targets.length} languages`,
      `${fmtBytes(totalBytes)} written  ·  ${ms} ms`,
    ].join("\n"),
    style: { borderColor: "green", padding: 1 },
  });
}

try {
  await main();
} catch (err) {
  log.error(err);
  process.exit(1);
}
