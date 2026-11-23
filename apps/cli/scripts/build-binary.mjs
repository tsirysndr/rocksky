import { createRequire } from "node:module";
import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repository = path.resolve(import.meta.dir, "../../..");
const args = process.argv.slice(2);
const option = (name, fallback) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const variant = option("--variant", "typescript");
if (!["typescript", "purescript"].includes(variant))
  throw new Error("--variant must be typescript or purescript");
const target = option("--target", `bun-${process.platform}-${process.arch}`);
if (!/^bun-(linux-(x64|arm64)|darwin-arm64)$/.test(target))
  throw new Error(
    "--target must be bun-linux-x64, bun-linux-arm64, or bun-darwin-arm64",
  );
const [, platform, architecture] = target.split("-");
const directory = path.join(
  repository,
  variant === "purescript" ? "purescript/cli" : "apps/cli",
);
const output = path.resolve(
  option(
    "--outfile",
    path.join(
      directory,
      "dist",
      variant === "purescript" ? "rocksky-purescript" : "rocksky",
    ),
  ),
);
const require = createRequire(path.join(directory, "package.json"));
const packageRoot = (name) =>
  path.dirname(require.resolve(`${name}/package.json`));
const audioName =
  platform === "darwin" ? "librockbox_ffi.dylib" : "librockbox_ffi.so";
const audio = require.resolve(
  `@rockbox-ffi/${platform}-${architecture}/${audioName}`,
);
const rockbox = Bun.resolveSync("rockbox-ffi/bun", directory);
const classic = packageRoot("classic-level");
const prebuilt = path.join(
  classic,
  "prebuilds",
  platform === "darwin" ? "darwin-x64+arm64" : `linux-${architecture}`,
);
// Linux x64 ships both glibc and musl prebuilds. Directory order is not an
// ABI selector: this release targets glibc, as does the OpenTUI library below.
const bindings = (await readdir(prebuilt)).filter(
  (file) => file.endsWith(".node") && !file.includes(".musl."),
);
if (bindings.length !== 1)
  throw new Error(`Expected one compatible LevelDB binding in ${prebuilt}`);
const binding = path.join(prebuilt, bindings[0]);
const buildDirectory = path.join(directory, ".binary-build", target);
await mkdir(buildDirectory, { recursive: true });
await mkdir(path.dirname(output), { recursive: true });
const ui = path.join(
  directory,
  variant === "purescript" ? "runtime/tui" : "src/tui",
);
const entry = path.join(buildDirectory, "entry.ts");
const quote = JSON.stringify;
await writeFile(
  entry,
  `
import nativeLibrary from "rocksky:audio";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createHash} from "node:crypto";
import {registerCompiledTui} from ${quote(path.join(ui, "compiled" + (variant === "purescript" ? ".js" : ".ts")))};
import {tui} from ${quote(path.join(ui, "launch" + (variant === "purescript" ? ".js" : ".tsx")))};
registerCompiledTui(tui);
const bytes = fs.readFileSync(nativeLibrary);
const hash = createHash("sha256").update(bytes).digest("hex");
const nativeDirectory = path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"), "rocksky", "native", hash);
const nativePath = path.join(nativeDirectory, ${quote(audioName)});
if (!process.env.ROCKBOX_FFI_LIB) {
  fs.mkdirSync(nativeDirectory, {recursive:true,mode:0o700});
  if (!fs.existsSync(nativePath)) {
    const temporary = nativePath + "." + process.pid;
    fs.writeFileSync(temporary, bytes, {mode:0o700});
    fs.renameSync(temporary,nativePath);
  }
  process.env.ROCKBOX_FFI_LIB = nativePath;
}
process.env.ROCKSKY_CLI_MIGRATIONS = path.join(import.meta.dir,"drizzle");
if (process.env.ROCKSKY_BINARY_SELF_TEST === "1") {
  const {abiVersion} = await import("rockbox-ffi/node");
  const {Database} = await import("bun:sqlite");
  const {drizzle} = await import("drizzle-orm/better-sqlite3");
  const {migrate} = await import("drizzle-orm/better-sqlite3/migrator");
  const sqlite = new Database(":memory:");
  migrate(drizzle(sqlite),{migrationsFolder:process.env.ROCKSKY_CLI_MIGRATIONS});
  if (!sqlite.query("SELECT name FROM sqlite_master WHERE type='table'").all().length) throw new Error("Embedded migrations did not run");
  sqlite.close();
  const {ClassicLevel} = await import("classic-level");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(),"rocksky-binary-"));
  try { const db=new ClassicLevel(path.join(temp,"level")); await db.put("test","ok"); if(await db.get("test")!=="ok")throw new Error("LevelDB failed");await db.close(); } finally {fs.rmSync(temp,{recursive:true,force:true});}
  console.log("Binary runtime verified: OpenTUI, Rockbox ABI " + abiVersion() + ", SQLite migrations and LevelDB");
} else {
  await import(${quote(path.join(directory, variant === "purescript" ? "index.js" : "src/index.ts"))});
}
`,
);
process.chdir(directory);
const result = await Bun.build({
  entrypoints: [entry],
  compile: { target, outfile: output, assets: ["./drizzle"] },
  target: "bun",
  minify: true,
  define: { "process.env.OPENTUI_LIBC": JSON.stringify("glibc") },
  external: ["@rocksky/mcp", "nfc-pcsc", "@pokusew/pcsclite", "x11"],
  plugins: [
    {
      name: "standalone-native-runtime",
      setup(build) {
        build.onResolve({ filter: /^rocksky:audio$/ }, () => ({
          path: "audio",
          namespace: "rocksky-assets",
        }));
        build.onLoad({ filter: /.*/, namespace: "rocksky-assets" }, () => ({
          contents: `import file from ${quote(audio)} with {type:"file"};export default file;`,
          loader: "ts",
          resolveDir: directory,
        }));
        build.onResolve({ filter: /^rockbox-ffi\/node$/ }, () => ({
          path: rockbox,
        }));
        build.onResolve({ filter: /^better-sqlite3$/ }, () => ({
          path: "sqlite",
          namespace: "rocksky-sqlite",
        }));
        build.onLoad({ filter: /.*/, namespace: "rocksky-sqlite" }, () => ({
          contents: 'export {Database as default} from "bun:sqlite";',
          loader: "js",
        }));
        build.onResolve(
          { filter: /^drizzle-orm\/better-sqlite3(?:\/migrator)?$/ },
          (args) => ({
            path: require.resolve(
              args.path.replace("better-sqlite3", "bun-sqlite"),
            ),
          }),
        );
        build.onResolve({ filter: /^node-gyp-build$/ }, (args) =>
          args.importer.startsWith(classic)
            ? { path: "level", namespace: "rocksky-level" }
            : undefined,
        );
        build.onLoad({ filter: /.*/, namespace: "rocksky-level" }, () => ({
          contents: `module.exports = () => require(${quote(binding)});`,
          loader: "js",
          resolveDir: directory,
        }));
      },
    },
  ],
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
const binary = await readFile(output);
const digest = createHashForFile(binary);
await writeFile(output + ".sha256", `${digest}  ${path.basename(output)}\n`);
console.log(`Built ${output} (${Math.round(binary.length / 1024 / 1024)} MiB)`);
function createHashForFile(bytes) {
  return new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
}
