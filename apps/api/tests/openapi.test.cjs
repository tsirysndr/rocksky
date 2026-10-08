const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "../../..");
const spec = JSON.parse(
  fs.readFileSync(path.join(root, "docs/api-reference/openapi.json")),
);
const operation = (name, method = "get") =>
  spec.paths["/app.rocksky." + name][method];
const schema = (name) => spec.components.schemas["app.rocksky." + name];

test("generated OpenAPI is current", () => {
  execFileSync(process.execPath, [
    path.join(root, "apps/api/scripts/generate-openapi.cjs"),
    "--check",
  ]);
});
test("documents only registered endpoints, including the uploaded library", () => {
  assert.equal(Object.keys(spec.paths).length, 152);
  for (const name of [
    "library.getAlbum",
    "notification.listNotifications",
    "stats.getWrapped",
    "song.matchSong",
    "equalizer.listPresets",
  ])
    assert.ok(operation(name));
  for (const name of [
    "feed.describeFeedGenerator",
    "feed.getFeedSkeleton",
    "player.addDirectoryToQueue",
  ])
    assert.equal(spec.paths["/app.rocksky." + name], undefined);
});
test("distinguishes public, optional and authenticated operations", () => {
  assert.deepEqual(operation("song.getSongs").security, []);
  assert.deepEqual(operation("song.getSong").security, [{}, { Bearer: [] }]);
  assert.deepEqual(operation("library.getAlbum").security, [{ Bearer: [] }]);
  assert.deepEqual(operation("scrobble.createScrobble", "post").security, [
    { Bearer: [] },
  ]);
});
test("preserves procedure query parameters and JSON bodies", () => {
  assert.ok(
    operation("player.play", "post").parameters.some(
      (p) => p.name === "playerId" && p.in === "query",
    ),
  );
  assert.ok(
    operation("scrobble.createScrobble", "post").requestBody.content[
      "application/json"
    ],
  );
  assert.ok(
    operation("song.getSong").parameters.some((p) => p.name === "spotifyId"),
  );
});
test("includes identifiers, nullable values and fractional wire fields", () => {
  const song = schema("song.defs__songViewDetailed");
  assert.ok(song.properties.mbId);
  assert.ok(song.properties.isrc);
  assert.deepEqual(song.properties.bpm.type, ["number", "null"]);
  assert.ok(
    Object.values(song.properties).some((p) =>
      p.anyOf?.some((t) => t.type === "null"),
    ),
  );
  assert.equal(
    schema("actor.defs__compatibilityViewBasic").properties
      .compatibilityPercentage.type,
    "number",
  );
});
test("does not promise successful downloads from unimplemented handlers", () => {
  const download = operation("dropbox.downloadFile");
  assert.equal(download["x-implementation-status"], "not-implemented");
  assert.equal(download.responses["200"], undefined);
  assert.equal(
    operation("player.next", "post")["x-implementation-status"],
    "placeholder",
  );
  assert.equal(
    operation("spotify.next", "post")["x-implementation-status"],
    undefined,
  );
});
test("schema refs resolve and nullable properties stay optional unless required", () => {
  const walk = (value) => {
    if (!value || typeof value !== "object") return;
    if (value.$ref)
      assert.ok(
        spec.components.schemas[value.$ref.split("/").at(-1)],
        value.$ref,
      );
    if (value.required && value.properties)
      for (const name of value.required)
        assert.ok(name in value.properties, name);
    Object.values(value).forEach(walk);
  };
  walk(spec);
});
