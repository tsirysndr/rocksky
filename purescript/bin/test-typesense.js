import assert from "node:assert/strict";
import { fromAff } from "../output/Control.Promise/index.js";
import { federatedSearch } from "../output/Rocksky.Typesense.Search/index.js";
import { searchLibraryTracks } from "../output/Rocksky.Typesense.Library/index.js";
let searches;
const context = { typesense: { multiSearch: { async perform(input) {
  searches = input.searches;
  return { results: [
    { found: 4, hits: [{ document: { id: "album", title: "Album" } }] },
    { error: "unavailable" },
    { found: 2, hits: [{ document: { id: "song", title: "Song" } }] },
    { found: 0 }, { found: 0, hits: [] },
  ] };
} } } };
const result = await fromAff(federatedSearch(context)("query")(10))();
assert.equal(searches.length, 5);
assert.ok(searches.every(s => s.q === "query" && s.per_page === 10 && s.page === 1 && s.prioritize_exact_match === true));
assert.equal(searches[0].query_by, "title,artist");
assert.deepEqual(result.hits, [{ id: "album", title: "Album", _federation: { indexUid: "albums" } }, { id: "song", title: "Song", _federation: { indexUid: "tracks" } }]);
assert.equal(result.estimatedTotalHits, 6);
assert.equal(result.limit, 50);
assert.equal(result.offset, 0);
let params;
const libraryContext = { typesense: { collections(collection) {
  assert.equal(collection, "library_tracks");
  return { documents() { return { async search(input) {
    params = input;
    return { hits: [{ document: { id: "upload", user_id: "owner", track_id: "track", title: "Title", artist: "Artist", album: "Album", album_artist: "Album Artist", duration: 250, r2_key: "key", mime_type: "audio/flac", file_size: 12345, uploaded_at: 1700000000000 } }] };
  } }; } };
} } };
const rows = await fromAff(searchLibraryTracks(libraryContext)({ query: "", userId: "owner", limit: 250, offset: 400 }))();
assert.equal(params.q, "*");
assert.equal(params.per_page, 200);
assert.equal(params.page, 3);
assert.equal(params.filter_by, "user_id:=owner");
assert.equal(params.sort_by, "uploaded_at:desc");
assert.equal(rows[0].upload.uploadedAt.toISOString(), new Date(1700000000000).toISOString());
assert.equal(rows[0].upload.originalFilename, null);
assert.equal(rows[0].track.genre, null);
assert.equal(rows[0].track.year, null);
assert.equal(rows[0].albumReleaseDate, null);
assert.equal(rows[0].track.albumArtist, "Album Artist");
console.log("Verified federated-search grouping/error handling and uploaded-library pagination/response shape.");

const { indexUsers } = await import("../output/Rocksky.Typesense.Search/index.js");
const { ensureSearchCollections } = await import("../output/Rocksky.Typesense.Schema/index.js");
const existing = new Set(), created = [];
let imports = 0;
const fresh = {typesense: {collections(name) {
  return name ? {
    async retrieve() { if (!existing.has(name)) throw Object.assign(new Error("missing"), {httpStatus:404}); return {}; },
    documents() { return {async import() { imports++; if (!existing.has(name)) throw Object.assign(new Error("missing"), {httpStatus:404}); return []; }}; }
  } : {async create(schema) {assert.equal(schema.fields.find(f => f.name === ".*").optional, true); created.push(schema.name); existing.add(schema.name); return schema;}};
}}};
await fromAff(indexUsers(fresh)([{id:"user",handle:"user.test"}]))();
assert.equal(imports,2);
assert.deepEqual(created,["albums","artists","tracks","users","playlists"]);
await fromAff(indexUsers(fresh)([{id:"user",handle:"user.test"}]))();
assert.equal(created.length,5);
let attemptedCreate = false;
const denied = {typesense: {collections(name) {return name ? {async retrieve() {throw Object.assign(new Error("denied"),{httpStatus:401});}} : {async create() {attemptedCreate=true;}};}}};
await assert.rejects(fromAff(ensureSearchCollections(denied))(), /denied/);
assert.equal(attemptedCreate,false);
const raced = new Set();
const race = {typesense: {collections(name) {return name ? {async retrieve() {if(!raced.has(name)){raced.add(name);throw Object.assign(new Error("missing"),{httpStatus:404});}return {};}} : {async create(){throw Object.assign(new Error("exists"),{httpStatus:409});}};}}};
await fromAff(ensureSearchCollections(race))();
console.log("Verified missing collection recovery, authentication failures, and concurrent creation.");
