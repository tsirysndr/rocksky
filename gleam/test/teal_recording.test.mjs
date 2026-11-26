import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { Ok } from "../build/dev/javascript/rocksky_api/gleam.mjs";
import { None, Some } from "../build/dev/javascript/gleam_stdlib/gleam/option.mjs";
import { selectRecording, forQueue, resolvePending } from "../build/dev/javascript/rocksky_api/rocksky_api/tealfm/recording_ffi.mjs";

const id = "99731ec6-0fe9-45bb-9b18-16d2e552ac0a";
const row = {id, title:"One Night/All Night", length:276066,
  "artist-credit":[{name:"Justice"},{name:"Tame Impala"}], releases:[{title:"Hyperdrama"}]};
const play = {trackName:row.title, artists:[{artistName:"Justice"},{artistName:"Tame Impala"}],
  releaseName:"Hyperdrama", duration:276, playedTime:"2026-11-26T08:00:00.000Z"};
function choose(rows, code="") {
  return selectRecording(rows, play.trackName, "Justice, Tame Impala", play.releaseName, 276113, code);
}
test("recording selection checks artist credits, release, duration, conflicts and ambiguity", () => {
  assert.equal(choose([row,{...row,length:193000}]),id);
  assert.equal(choose([{...row,releases:[]}]),undefined);
  assert.equal(choose([{...row,releases:[],isrcs:["FRABC2300001"]}],"FRABC2300001"),id);
  assert.equal(choose([{...row,isrcs:["FRABC2300002"]}],"FRABC2300001"),undefined);
  assert.equal(choose([row,{...row,id:"52694350-9bad-4ab1-9b9f-87c3a40905dd"}]),undefined);
});
test("a temporary failure remains retryable and the retry publishes only public fields", async () => {
  let busy=true;
  const server=createServer((req,res) => {
    assert.equal(req.url,"/search");
    res.writeHead(busy?503:200,{"content-type":"application/json"});
    res.end(JSON.stringify([row]));
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  try {
    const url="http://127.0.0.1:"+server.address().port;
    const pending=forQueue(play,"");
    assert.equal((await resolvePending(url,pending)) instanceof Ok,false);
    busy=false;
    const reply=await resolvePending(url,pending);
    assert.ok(reply[0] instanceof Some);
    assert.deepEqual(reply[0][0],{...play,recordingMbId:"mbid:"+id});
    const unknown=await resolvePending(url,{...pending,trackName:"Different song"});
    assert.ok(unknown[0] instanceof None);
  } finally { await new Promise(resolve=>server.close(resolve)); }
});
