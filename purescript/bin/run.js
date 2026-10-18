// Usage: node bin/run.js Rocksky.Index | Rocksky.Server | Rocksky.Scripts.Sync ...
// Runs the compiled PureScript module's `main` from ./output.
const name = process.argv[2];
if (!name) {
  console.error("usage: node bin/run.js <Module.Name>");
  process.exit(2);
}
const { main } = await import(`../output/${name}/index.js`);
main();
