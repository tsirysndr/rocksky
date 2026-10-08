// Generate documentation only. Never executes API handlers or modifies lexicons.
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const root = path.resolve(__dirname, "../../..");
const api = path.join(root, "apps/api");
const target = path.join(root, "docs/api-reference/openapi.json");
const read = (p) => fs.readFileSync(p, "utf8");
function files(dir) {
  return fs
    .readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const p = path.join(dir, name);
      return fs.statSync(p).isDirectory() ? files(p) : [p];
    });
}
const docs = Object.fromEntries(
  files(path.join(api, "lexicons"))
    .filter((p) => p.endsWith(".json"))
    .map((p) => {
      const doc = JSON.parse(read(p));
      return [doc.id, doc];
    }),
);
// Follow the actual registration tree, excluding unregistered lexicon methods.
const methods = new Map();
const visited = new Set();
function registrations(file) {
  if (visited.has(file)) return;
  visited.add(file);
  const source = read(file);
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const imports = new Map();
  for (const node of ast.statements) {
    if (
      ts.isImportDeclaration(node) &&
      node.importClause?.name &&
      node.moduleSpecifier.text.startsWith(".")
    ) {
      const base = path.resolve(path.dirname(file), node.moduleSpecifier.text);
      imports.set(
        node.importClause.name.text,
        fs.existsSync(base + ".ts")
          ? base + ".ts"
          : path.join(base, "index.ts"),
      );
    }
  }
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const name = node.expression.getText(ast);
      if (imports.has(name) && node.arguments[0]?.getText(ast) === "server")
        registrations(imports.get(name));
      if (name.startsWith("server.app.rocksky."))
        methods.set(name.slice(7), { source, file });
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
}
registrations(path.join(api, "src/xrpc/index.ts"));
const key = (id, name = "main") => `${id}__${name}`;
const ref = (value, id) => {
  const [base, name = "main"] = value.split("#");
  if (!docs[base || id]?.defs[name])
    throw new Error(`Unresolved lexicon ref: ${value} from ${id}`);
  return { $ref: `#/components/schemas/${key(base || id, name)}` };
};
function schema(s, id) {
  let out;
  switch (s.type) {
    case "ref":
      out = ref(s.ref, id);
      break;
    case "union":
      out = { anyOf: s.refs.map((r) => ref(r, id)) };
      if (!s.closed)
        out.anyOf.push({
          type: "object",
          required: ["$type"],
          properties: { $type: { type: "string" } },
        });
      break;
    case "record":
      return schema(s.record, id);
    case "object":
    case "params":
      out = { type: "object", properties: {} };
      for (const [name, value] of Object.entries(s.properties || {})) {
        const prop = schema(value, id);
        out.properties[name] =
          s.nullable?.includes(name) && value.type !== "unknown"
            ? { anyOf: [prop, { type: "null" }] }
            : prop;
      }
      if (s.required?.length) out.required = s.required;
      break;
    case "array":
      out = { type: "array", items: schema(s.items, id) };
      break;
    case "string":
    case "integer":
    case "boolean":
      out = { type: s.type };
      break;
    case "unknown":
      out = {};
      break;
    // A token is a symbolic value: a string that is the token's own NSID
    // fragment (e.g. `community.lexicon.calendar.rsvp#going`).
    case "token":
      out = { type: "string" };
      break;
    case "blob":
      out = {
        type: "object",
        description: "AT Protocol blob reference.",
        properties: {
          $type: { const: "blob", type: "string" },
          ref: { type: "object", properties: { $link: { type: "string" } } },
          mimeType: { type: "string" },
          size: { type: "integer", minimum: 0 },
        },
      };
      break;
    default:
      throw new Error(`Unsupported lexicon schema type: ${s.type}`);
  }
  for (const attr of [
    "description",
    "default",
    "enum",
    "const",
    "minimum",
    "maximum",
  ])
    if (s[attr] !== undefined) out[attr] = s[attr];
  for (const attr of ["minLength", "maxLength"])
    if (s[attr] !== undefined)
      out[s.type === "array" ? attr.replace("Length", "Items") : attr] =
        s[attr];
  for (const attr of [
    "knownValues",
    "maxGraphemes",
    "minGraphemes",
    "accept",
    "maxSize",
  ])
    if (s[attr] !== undefined) out[`x-lexicon-${attr}`] = s[attr];
  if (s.format) {
    if (["datetime", "uri"].includes(s.format))
      out.format = s.format === "datetime" ? "date-time" : "uri";
    else out["x-lexicon-format"] = s.format;
  }
  return out;
}
const optionalAuth = new Set([
  "notification.listNotifications",
  "notification.getUnreadCount",
  "notification.updateSeen",
  "actor.getActorAlbums",
  "actor.getActorCompatibility",
  "actor.getActorScrobbles",
  "actor.getProfile",
  "album.getAlbum",
  "song.getSong",
  "scrobble.getScrobble",
  "playlist.getPlaylist",
  "feed.getFeed",
  "feed.getStories",
  "graph.getKnownFollowers",
  "mirror.getMirrorSources",
  "equalizer.listPresets",
  "rockbox.getAudioSettings",
  "shout.getAlbumShouts",
  "shout.getArtistShouts",
  "shout.getProfileShouts",
  "shout.getTrackShouts",
  "shout.getShoutReplies",
]);
const notes = {
  "notification.listNotifications":
    "Authenticate to retrieve your notifications. Without a token, returns an empty list and zero unread count.",
  "notification.getUnreadCount":
    "Authenticate to retrieve your unread count. Without a token, returns zero.",
  "notification.updateSeen":
    "Authentication is needed to change notifications. Without a token, makes no changes and returns zero unread count.",
  "feed.getFeed": "Authentication is required when filtering by following.",
  "feed.getStories": "Authentication is required when filtering by following.",
  "equalizer.listPresets":
    "Supply did for public lookup, or authenticate to use your own DID.",
  "rockbox.getAudioSettings":
    "Supply did for public lookup, or authenticate to use your own DID.",
  "graph.getKnownFollowers": "Without authentication, returns an empty result.",
  "mirror.getMirrorSources":
    "Without authentication, returns the default disabled provider settings.",
};
const spec = {
  openapi: "3.1.0",
  info: {
    title: "Rocksky XRPC API",
    version: "1.0.0",
    description:
      "Generated from the registered Rocksky XRPC handlers and current lexicons. Provider-defined payloads remain open schemas. Some handlers return empty fallback objects on service failures. This reference describes the repository implementation; production may run an earlier revision.",
    license: { name: "MIT License", identifier: "MIT" },
  },
  servers: [
    { url: "https://api.rocksky.app/xrpc", description: "Rocksky API" },
  ],
  paths: {},
  components: {
    securitySchemes: {
      Bearer: {
        type: "http",
        scheme: "bearer",
        description: "Rocksky bearer token.",
      },
    },
    schemas: {
      XrpcError: {
        type: "object",
        required: ["error"],
        properties: { error: { type: "string" }, message: { type: "string" } },
      },
    },
  },
};
for (const [id, doc] of Object.entries(docs).sort()) {
  if (id.startsWith("app.bsky.")) continue;
  for (const [name, def] of Object.entries(doc.defs)) {
    if (!["query", "procedure", "subscription"].includes(def.type))
      spec.components.schemas[key(id, name)] = schema(def, id);
  }
}
// Wire values that Lexicon cannot express (floats and untagged unions).
for (const exception of JSON.parse(
  read(path.join(api, "tests/xrpc-response-exceptions.json")),
)) {
  const parent =
    spec.components.schemas[key(exception.lexicon, exception.definition)];
  if (!parent?.properties)
    throw new Error(`Unknown exception definition: ${exception.lexicon}`);
  parent.properties[exception.field] =
    exception.field === "updatedAt"
      ? {
          anyOf: [{ type: "string" }, { type: "object" }],
          description: exception.reason,
        }
      : {
          type: exception.field === "bpm" ? ["number", "null"] : "number",
          description: exception.reason,
        };
}
for (const [id, { source }] of [...methods].sort()) {
  const def = docs[id]?.defs.main;
  if (!def || !["query", "procedure"].includes(def.type))
    throw new Error(`Missing HTTP lexicon for ${id}`);
  const short = id.replace("app.rocksky.", "");
  const hasAuth = /auth:\s*ctx.authVerifier|proxyMethod\(ctx/.test(source);
  const security = hasAuth
    ? optionalAuth.has(short)
      ? [{}, { Bearer: [] }]
      : [{ Bearer: [] }]
    : [];
  const operation = {
    tags: [id.split(".").slice(0, -1).join(".")],
    summary: def.description || short,
    operationId: id,
    security,
    parameters: [],
    responses: {},
  };
  if (notes[short]) operation.description = notes[short];
  for (const [name, param] of Object.entries(
    def.parameters?.properties || {},
  )) {
    operation.parameters.push({
      name,
      in: "query",
      required: def.parameters.required?.includes(name) || false,
      ...(param.description ? { description: param.description } : {}),
      schema: schema(param, id),
      ...(param.type === "array" ? { style: "form", explode: true } : {}),
    });
  }
  if (def.input)
    operation.requestBody = {
      required: true,
      content: {
        [def.input.encoding]: {
          schema: def.input.schema
            ? schema(def.input.schema, id)
            : { type: "string", format: "binary" },
        },
      },
    };
  const stub = /Not implemented yet/.test(source);
  if (stub) {
    operation.description =
      "This route is registered but currently throws a not-implemented error. It does not return the download described by its lexicon.";
    operation["x-implementation-status"] = "not-implemented";
  } else {
    operation.responses["200"] = {
      description: "Success",
      ...(def.output
        ? {
            content: {
              [def.output.encoding]: {
                schema: def.output.schema
                  ? schema(def.output.schema, id)
                  : { type: "string", format: "binary" },
              },
            },
          }
        : {}),
    };
    if (
      short.startsWith("player.") ||
      (/\/\/ Logic to /.test(source) && !short.startsWith("spotify."))
    ) {
      operation.description = [
        operation.description,
        "The current handler contains placeholder logic; a successful response does not guarantee the requested operation was performed.",
      ]
        .filter(Boolean)
        .join("\n\n");
      operation["x-implementation-status"] = "placeholder";
    }
  }
  operation.responses.default = {
    description: "XRPC error response.",
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/XrpcError" },
      },
    },
  };
  operation.responses["400"] = {
    description: "Invalid XRPC request or parameters.",
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/XrpcError" },
      },
    },
  };
  if (def.errors?.length) operation["x-xrpc-errors"] = def.errors;
  spec.paths["/" + id] = { [def.type === "query" ? "get" : "post"]: operation };
}
// Include only schemas reachable from registered endpoints.
const reachable = new Set();
function collectRefs(value) {
  if (!value || typeof value !== "object") return;
  if (value.$ref) {
    const name = value.$ref.split("/").at(-1);
    if (!reachable.has(name)) {
      reachable.add(name);
      collectRefs(spec.components.schemas[name]);
    }
  }
  Object.values(value).forEach(collectRefs);
}
collectRefs(spec.paths);
for (const name of Object.keys(spec.components.schemas)) {
  if (!reachable.has(name)) delete spec.components.schemas[name];
}
// Fail instead of shipping dangling refs.
function checkRefs(value) {
  if (!value || typeof value !== "object") return;
  if (value.$ref && !spec.components.schemas[value.$ref.split("/").at(-1)])
    throw new Error(`Dangling ref: ${value.$ref}`);
  Object.values(value).forEach(checkRefs);
}
checkRefs(spec);
const output = JSON.stringify(spec, null, 2) + "\n";
if (process.argv.includes("--check")) {
  if (read(target) !== output)
    throw new Error(
      "OpenAPI is stale. Run node apps/api/scripts/generate-openapi.cjs",
    );
} else fs.writeFileSync(target, output);
console.log(
  `${process.argv.includes("--check") ? "Checked" : "Generated"} ${methods.size} registered XRPC endpoints.`,
);
