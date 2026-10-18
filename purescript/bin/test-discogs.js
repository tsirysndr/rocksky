import assert from "node:assert/strict";
import { fromAff } from "../output/Control.Promise/index.js";
import { Just, Nothing } from "../output/Data.Maybe/index.js";
import * as R from "../output/Rocksky.Lib.DiscogsRelation/index.js";
import * as E from "../output/Rocksky.Lib.DiscogsEnrichment/index.js";
import { getTableName } from "drizzle-orm";
const run = value => fromAff(value)();
const none = Nothing.value;
for (const [input, output] of [["7", [0,7]], ["2-04",[2,4]], ["1.3",[1,3]], ["A1",[1,1]], ["B2",[1,2]], ["C2",[2,2]], ["", [0,0]], ["Video",[0,0]]]) assert.deepEqual(R.parsePosition(input), output);
for (const [input, output] of [["6:09",369000], ["1:02:03",3723000], ["",0], ["nope",0], ["1:2x",0], ["1:-1",0], ["1:2:3:4",0], ["1:",60000], ["1:1e1",70000]]) assert.equal(R.parseDurationMs(input), output);
assert.equal(R.joinArtistCredits([{ name: "Daft Punk", join: "Feat." }, { name: "Pharrell Williams" }]), "Daft Punk Feat. Pharrell Williams");
assert.equal(R.joinArtistCredits([{ name: "A", join: "," }, { name: "B" }]), "A, B");
assert.equal(R.joinArtistCredits([{ name: "Nile Rodgers (2)", anv: "Nile Rodgers" }]), "Nile Rodgers");
assert.deepEqual(R.toTrackRows("release")([{ position: "", type_: "heading", title: " Side C " }, { position: "C2", type_: "track", title: "Get Lucky", duration: "6:09" }]), [
  { releaseId: "release", position: null, type: "heading", title: "Side C", duration: null, durationMs: null, discNumber: null, trackNumber: null, idx: 0 },
  { releaseId: "release", position: "C2", type: "track", title: "Get Lucky", duration: "6:09", durationMs: 369000, discNumber: 2, trackNumber: 2, idx: 1 },
]);
assert.deepEqual(R.toReleaseArtistRows("release")([{ name: " " }, { id: 0, name: " A ", anv: " A!", join: "&" }]), [{ releaseId:"release", artistId:null,name:"A",anv:"A!",joinPhrase:"&",role:null,position:0 }]);
assert.deepEqual(R.toReleaseLabelRows("r")({ labels: [{name:"Label",entity_type_name:"",entity_type:"1"}],companies:[{name:"Company"}] }).map(r=>[r.kind,r.position,r.entityType]), [["label",0,"1"],["company",0,null]]);
assert.equal(R.toMasterRow({id:0,title:"Bad"}).constructor.name,"Nothing");
assert.equal(R.toMasterRow({id:5,title:" Master ",artists:[{name:"Artist"}],genres:[]}).value0.artist,"Artist");
const time = 1700000000000;
assert.equal(E.isStaleSearch({releaseId:"r",searchedAt:new Date(0)})(time),false);
assert.equal(E.isStaleSearch({releaseId:null,searchedAt:new Date(time-E.missRetryMs)})(time),false);
assert.equal(E.isStaleSearch({releaseId:null,searchedAt:new Date(time-E.missRetryMs-1)})(time),true);
assert.equal(E.discogsSearchKey(" Artist ")(" Album "),E.discogsSearchKey("artist")("album"));
const track = { artist:"Artist",albumArtist:"Artist",album:"Album",discogsReleaseId:5,credits:[{name:"Engineer",role:"Mix"}] };
assert.equal(E.toDiscogsReleaseRow({...track,discogsReleaseId:undefined})(none).constructor.name,"Nothing");
assert.equal(E.toDiscogsReleaseRow(track)(new Just(.9)).value0.score,.9);
assert.equal(E.toDiscogsReleaseRow(track)(none).value0.year,null);
assert.equal(E.matchScore({track,matches:[{id:6,score:.5},{id:5,score:.9}]}).value0,.9);
function harness({ search=null, release=null, response={track,matches:[{id:5,score:.9}]}, unavailable=false, failCredits=false }={}) {
  const events=[];
  const stored = { id:"release",discogsId:5,masterId:null,creditsFetchedAt:null,updatedAt:new Date(0), ...release };
  const selections = search ? [[search], ...(search.releaseId ? [[stored],[]] : [])] : [[],[]];
  const make = (op,t) => {
    const event={op,table:t&&getTableName(t)}; events.push(event);
    const b={};
    b.from=t=>{event.table=getTableName(t);return b;};
    for(const method of ["where","limit","onConflictDoUpdate"]) b[method]=value=>{event[method]=value;return b;};
    b.values=rows=>{event.rows=rows;return b;};b.set=fields=>{event.fields=fields;return b;};
    b.returning=()=>{event.returning=true;return b;};
    b.execute=async()=>{
      if(op==="select") { assert.ok(selections.length,"Unexpected select "+event.table);return selections.shift(); }
      if(failCredits&&op==="insert"&&event.table==="discogs_credits") throw new Error("connection dropped");
      return event.returning?[stored]:[];
    };
    return b;
  };
  const db={select:()=>make("select"),insert:t=>make("insert",t),delete:t=>make("delete",t),update:t=>make("update",t),async transaction(fn){events.push({op:"begin"});try{const result=await fn(db);events.push({op:"commit"});return result;}catch(e){events.push({op:"rollback"});throw e;}}};
  const ctx={db,discogs:{async request(config){events.push({op:"http",url:config.url});if(unavailable)throw new Error("offline");return {data:config.url==="/enrich"?response:{id:5,title:"Album",artists:[{id:1,name:"Artist"}],tracklist:[{title:"Song",position:"A1",duration:"1:02"}]}};}}};
  return {ctx,events};
}
{
 const h=harness({unavailable:true});
 assert.equal((await run(E.enrichAlbumWithDiscogs(h.ctx)("Artist")("Album")(none))).constructor.name,"Unavailable");
 assert.equal(h.events.some(e=>e.op==="insert"),false);
}
{
 const h=harness({response:{track:null,matches:[]}});
 assert.equal((await run(E.enrichAlbumWithDiscogs(h.ctx)("Artist")("Album")(none))).constructor.name,"Missed");
 assert.equal(h.events.find(e=>e.op==="insert").table,"discogs_searches");
}
{
 const h=harness({search:{releaseId:null,searchedAt:new Date()}});
 assert.equal((await run(E.enrichAlbumWithDiscogs(h.ctx)("Artist")("Album")(none))).constructor.name,"Missed");
 assert.equal(h.events.some(e=>e.op==="http"),false);
}
{
 const h=harness({search:{releaseId:"release",searchedAt:new Date(0)},release:{creditsFetchedAt:new Date()}});
 assert.equal((await run(E.enrichAlbumWithDiscogs(h.ctx)("Artist")("Album")(none))).constructor.name,"Matched");
 assert.equal(h.events.some(e=>e.op==="http"),false);
}
{
 const h=harness();
 const result=await run(E.enrichAlbumWithDiscogs(h.ctx)("Artist")("Album")(none));
 assert.equal(result.constructor.name,"Matched");
 const completion=h.events.findIndex(e=>e.op==="update"&&e.table==="discogs_releases");
 const child=h.events.findIndex(e=>e.op==="insert"&&e.table==="discogs_tracks");
 const search=h.events.findIndex(e=>e.op==="insert"&&e.table==="discogs_searches");
 assert.ok(child<completion&&completion<search);
 assert.equal(h.events.filter(e=>e.op==="commit").length,2);
 assert.ok(result.value0.creditsFetchedAt instanceof Date);
}
{
 const h=harness({failCredits:true});
 await assert.rejects(run(E.enrichAlbumWithDiscogs(h.ctx)("Artist")("Album")(none)),/connection dropped/);
 assert.ok(h.events.some(e=>e.op==="rollback"));
 assert.equal(h.events.some(e=>e.op==="update"&&e.table==="discogs_releases"),false);
 assert.equal(h.events.some(e=>e.op==="insert"&&e.table==="discogs_searches"),false);
}
console.log("Verified Discogs mapping, stale-miss boundary, unavailable vs missed, cached hits, child transactions and completion ordering.");

// Subscriber tests use inert NATS iterators and DB query boundaries.
const { readFile } = await import("node:fs/promises");
process.env.NODE_ENV = "test";
const envSource = await readFile(new URL("../api/src/Rocksky/Lib/Env.purs", import.meta.url), "utf8");
for (const [, name] of envSource.matchAll(/"([A-Z0-9_]+)": str required/g)) process.env[name] = "discogs-test";
const { subscribe } = await import("../output/Rocksky.Subscribers.Index/index.js");
const subjects = [];
subscribe({ nc: { subscribe(subject) { subjects.push(subject); return { [Symbol.asyncIterator]() { return this; }, async next() { return {done:true}; } }; } } })();
assert.deepEqual(subjects, ["rocksky.playlist.import", "rocksky.playlist.indexed", "rocksky.track", "rocksky.user", "rocksky.scrobble.new", "rocksky.song.changed", "rocksky.song.stopped"]);
const { updateUris, refreshScrobbles } = await import("../output/Rocksky.Subscribers.Scrobble/index.js");
function queryDb(responses) {
 const pending=[...responses],events=[];
 const build=(op,t)=>{
  const event={op,table:t&&getTableName(t)};events.push(event);
  const b={};
  b.from=t=>{event.table=getTableName(t);return b;};
  for(const key of ["where","limit","innerJoin","orderBy"]) b[key]=value=>{event[key]=value;return b;};
  b.set=fields=>{event.fields=fields;return b;};
  b.execute=async()=>{if(op==="update")return [];assert.ok(pending.length);return pending.shift();};return b;
 };
 return {db:{select:()=>build("select"),update:t=>build("update",t)},events,done:()=>assert.equal(pending.length,0)};
}
{
 const track={id:"track",title:"Song",artist:"Artist",albumArtist:"Artist",album:"Album",albumUri:null,artistUri:null};
 const album={id:"album",uri:"at://repo/album/a",artistUri:null};
 const artist={id:"artist",uri:"at://repo/artist/a"};
 const m=queryDb([[{track}],[track],[album],[artist],[album],[artist]]);
 await run(updateUris({db:m.db})("did:listener"));
 m.done();
 assert.equal(m.events[0].limit,5);
 assert.deepEqual(m.events.filter(e=>e.op==="update").map(e=>[e.table,e.fields]),[
  ["tracks",{albumUri:album.uri}],["tracks",{artistUri:artist.uri}],["albums",{artistUri:artist.uri}]
 ]);
}
{
 const m=queryDb([[{scrobble:{id:"one"}},{scrobble:{id:"two"}}],[],[]]);
 await run(refreshScrobbles({db:m.db})("did:listener"));
 m.done();
 assert.equal(m.events.filter(e=>e.op==="select").length,3,"A failed publication must not suppress later history entries");
}
console.log("Verified all seven subscriber registrations, recent URI repair and per-scrobble publication failure isolation.");
