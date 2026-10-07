// Audits statically known handler/presentation fields without executing handlers or changing production data.
const ts = require("typescript");
const fs = require("fs"),
  path = require("path");
const root = path.resolve(__dirname, "..");
const cfg = ts.readConfigFile(root + "/tsconfig.json", ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, root);
const program = ts.createProgram(parsed.fileNames, {
  ...parsed.options,
  noEmit: true,
  strictNullChecks: true,
});
const checker = program.getTypeChecker();
const docs = {};
function walkdir(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walkdir(p);
    else if (p.endsWith(".json")) {
      const d = JSON.parse(fs.readFileSync(p));
      docs[d.id] = d;
    }
  }
}
walkdir(root + "/lexicons");
function resolve(s, id) {
  if (s?.type === "ref") {
    const [base, key = "main"] = s.ref.split("#");
    return resolve(docs[base || id]?.defs[key], base || id);
  }
  return s;
}
const findings = [];
const exceptions = JSON.parse(
  fs.readFileSync(
    path.join(root, "tests/xrpc-response-exceptions.json"),
    "utf8",
  ),
);
const definitionNames = new WeakMap();
for (const [id, doc] of Object.entries(docs))
  for (const [name, def] of Object.entries(doc.defs))
    definitionNames.set(def, { id, name });
function exempt(schema, field) {
  const def = definitionNames.get(schema);
  return (
    field === "$type" ||
    (def &&
      exceptions.some(
        (e) =>
          e.lexicon === def.id &&
          e.definition === def.name &&
          e.field === field,
      ))
  );
}
let checked = 0;
const inferredMethods = new Set();
function compare(type, s, id, loc, depth = 0) {
  if (depth === 0 && !(type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)))
    inferredMethods.add(id);
  if (depth > 4 || !s) return;
  s = resolve(s, id);
  if (!s) return;
  if (type.isUnion()) {
    for (const t of type.types)
      if (!(t.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)))
        compare(t, s, id, loc, depth);
    return;
  }
  if (
    type.flags &
    (ts.TypeFlags.Any |
      ts.TypeFlags.Unknown |
      ts.TypeFlags.Never |
      ts.TypeFlags.Undefined |
      ts.TypeFlags.Null)
  )
    return;
  const primitive = {
    string: checker.getStringType(),
    integer: checker.getNumberType(),
    boolean: checker.getBooleanType(),
  }[s.type];
  if (primitive && !checker.isTypeAssignableTo(type, primitive)) {
    // Date objects serialize as strings in JSON responses.
    if (s.type === "string" && type.symbol?.name === "Date") return;
    findings.push({
      id,
      path: loc,
      expected: s.type,
      type: checker.typeToString(type).slice(0, 180),
    });
    return;
  }
  if (s.type === "array") {
    const t = checker.getIndexTypeOfType(type, ts.IndexKind.Number);
    if (t) compare(t, s.items, id, loc + "[]", depth + 1);
    return;
  }
  if (
    s.type !== "object" ||
    type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)
  )
    return;
  for (const prop of type.getProperties()) {
    if (prop.name.startsWith("__")) continue;
    const decl = prop.valueDeclaration || prop.declarations?.[0];
    if (!decl) continue;
    const t = checker.getTypeOfSymbolAtLocation(prop, decl);
    if (!s.properties?.[prop.name] && !exempt(s, prop.name))
      findings.push({
        id,
        path: loc + "." + prop.name,
        type: checker.typeToString(t).slice(0, 180),
      });
    else
      compare(t, s.properties[prop.name], id, loc + "." + prop.name, depth + 1);
  }
}
for (const file of program.getSourceFiles()) {
  if (
    !file.fileName.includes("/src/xrpc/app/rocksky/") ||
    file.fileName.endsWith(".test.ts")
  )
    continue;
  const rel = file.fileName
    .split("/src/xrpc/")[1]
    .replace(/\.ts$/, "")
    .replaceAll("/", ".");
  const schema = docs[rel]?.defs.main?.output?.schema;
  if (!schema) continue;
  checked++;
  const hasPresentation = file.statements.some(
    (n) =>
      ts.isVariableStatement(n) &&
      n.declarationList.declarations.some(
        (d) => d.name.getText(file) === "presentation",
      ),
  );
  function visit(n) {
    if (
      !hasPresentation &&
      ts.isPropertyAssignment(n) &&
      n.name.getText(file) === "body" &&
      (() => {
        let a = n.parent;
        while (a) {
          if (ts.isPropertyAssignment(a) && a.name.getText(file) === "handler")
            return true;
          a = a.parent;
        }
        return false;
      })()
    )
      compare(checker.getTypeAtLocation(n.initializer), schema, rel, "body");
    if (
      ts.isVariableDeclaration(n) &&
      n.name.getText(file) === "presentation" &&
      n.initializer
    ) {
      function inner(v) {
        if (
          ts.isCallExpression(v) &&
          ["Effect.sync", "Effect.succeed"].includes(v.expression.getText(file))
        ) {
          let arg = v.arguments[0];
          if (!arg) return;
          while (ts.isAsExpression(arg) || ts.isTypeAssertionExpression(arg))
            arg = arg.expression;
          if (ts.isArrowFunction(arg)) {
            if (ts.isParenthesizedExpression?.(arg.body))
              compare(
                checker.getTypeAtLocation(arg.body.expression),
                schema,
                rel,
                "presentation",
              );
            else if (!ts.isBlock(arg.body))
              compare(
                checker.getTypeAtLocation(arg.body),
                schema,
                rel,
                "presentation",
              );
          } else
            compare(
              checker.getTypeAtLocation(arg),
              schema,
              rel,
              "presentation",
            );
        }
        ts.forEachChild(v, inner);
      }
      inner(n.initializer);
    }
    ts.forEachChild(n, visit);
  }
  visit(file);
}
const unique = [...new Map(findings.map((f) => [f.id + f.path, f])).values()];
if (unique.length) {
  console.error(JSON.stringify(unique, null, 2));
  process.exitCode = 1;
} else
  console.log(
    `Inspected ${checked} response-bearing handler files; ${inferredMethods.size} have locally inferred response expressions. No undeclared statically known fields outside documented wire exceptions. Provider/delegated payloads still require integration coverage.`,
  );
