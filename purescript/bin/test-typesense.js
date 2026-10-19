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

{
 const {createServer}=await import('node:http');
 const {once}=await import('node:events');
 const {createClient}=await import('../output/Typesense/index.js');
 let attempts=0;
 const server=createServer((_req,res)=>{attempts++;res.writeHead(503,{'content-type':'application/json'});res.end('{"message":"Not Ready or Lagging"}');});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 try {
  const sdk=createClient({host:'127.0.0.1',port:server.address().port,protocol:'http',apiKey:'test',connectionTimeoutSeconds:2})();
  await assert.rejects(sdk.collections('users').retrieve(),/Not Ready or Lagging/);
  assert.equal(attempts,1);
 } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 console.log('Verified Typesense SDK performs one attempt and leaves retries to the application.');
}
{
 const {handle}=await import('../output/Rocksky.Subscribers.User/index.js');
 const {PgDialect}=await import('drizzle-orm/pg-core');
 const dialect=new PgDialect(),queries=[],documents=[];
 const rows=[{id:'u',handle:'u.test'},{id:'v',handle:'v.test'}];
 const ctx={db:{select(){const q={from(){return q;},where(condition){queries.push(dialect.sqlToQuery(condition));return q;},async execute(){return rows.filter(row=>queries.at(-1).params.includes(row.id));}};return q;}},typesense:{collections:name=>({documents:()=>({import:async docs=>{assert.equal(name,'users');documents.push(docs);return docs.map(()=>({success:true}));}})})}};
 for(const payload of [{xata_id:'u'},{id:'u'},[{id:'u'}],[{xata_id:'u'},{id:'v'},{id:'u'}]]) {
  await fromAff(handle(ctx)(payload))();
  assert.deepEqual(documents.at(-1).map(row=>row.id),Array.isArray(payload)&&payload.length>1?['u','v']:['u']);
  assert.equal(new Set(queries.at(-1).params).size,queries.at(-1).params.length);
 }
 const before=queries.length;
 await fromAff(handle(ctx)([]))();
 assert.equal(queries.length,before);
 await assert.rejects(fromAff(handle(ctx)({handle:'invalid'}))(),/expected xata_id or id/);
 assert.equal(queries.length,before);
 console.log('Verified user events accept arrays and both ID formats, deduplicate IDs and reject invalid events.');
}
