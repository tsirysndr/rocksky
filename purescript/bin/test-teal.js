// Port of apps/api/src/tealfm/publication.test.ts, exercising compiled PureScript.
import assert from "node:assert/strict";
import { fromAff } from "../output/Control.Promise/index.js";
import { Just } from "../output/Data.Maybe/index.js";
import { publishTealRecord, publishTealStatus } from "../output/Rocksky.Tealfm.Publication/index.js";
import { loadLexicons } from "../output/Rocksky.Lexicon/index.js";
import { Lexicons } from "@atproto/lexicon";
const lexicons = new Lexicons(await fromAff(loadLexicons)());
const now = Date.parse("2026-10-15T15:00:00Z");
const record = { $type: "fm.teal.feed.play", duration: 215, trackName: "September", playedTime: new Date(now).toISOString(), artists: [{ artistName: "Earth, Wind & Fire" }], releaseName: "The Best", submissionClientAgent: "rocksky/v0.0.1" };
const key = "3mv234567abcd";
const runPlay = (mock, time = now) => fromAff(publishTealRecord(mock.agent)(record)(key)(new Just(time)))();
const runStatus = mock => fromAff(publishTealStatus(mock.agent)(record)(new Just(now)))();
function pds() {
  const records = new Map(), writes = [];
  const state = { losePlayAck: false, failStatus: false, raceStatus: false, failRead: false };
  const repo = {
    async getRecord({ collection, rkey }) {
      if (state.failRead) throw new Error("PDS unavailable");
      const data = records.get(`${collection}/${rkey}`);
      if (!data) throw Object.assign(new Error("missing"), { error: "RecordNotFound" });
      return { data };
    },
    async listRecords({ collection }) {
      return { data: { records: [...records.entries()].filter(([id]) => id.startsWith(collection + "/")).map(([, value]) => value) } };
    },
    async putRecord(input) {
      const id = `${input.collection}/${input.rkey}`, status = input.rkey === "self";
      if (status && state.failStatus) throw new Error("status unavailable");
      if (status && state.raceStatus) {
        state.raceStatus = false;
        records.set(id, { uri: id, cid: "newer", value: { time: new Date(now + 1000).toISOString() } });
      }
      if (input.swapRecord !== (records.get(id)?.cid ?? null)) throw new Error("InvalidSwap");
      writes.push(input);
      const data = { uri: id, cid: `cid-${writes.length}`, value: input.record };
      records.set(id, data);
      if (!status && state.losePlayAck) { state.losePlayAck = false; throw new Error("lost acknowledgement"); }
      return { data };
    },
  };
  return { agent: { assertDid: "did:plc:test", com: { atproto: { repo } } }, records, writes, state };
}
{
  const mock = pds(); mock.state.losePlayAck = true;
  await runPlay(mock); await runPlay(mock, now + 5000);
  assert.equal(mock.writes.length, 2);
  assert.equal(mock.writes[0].rkey, key);
  assert.equal(mock.writes[0].record.playedTime, record.playedTime);
  assert.equal(lexicons.validate("fm.teal.actor.status", mock.writes[1].record).success, true);
  assert.equal(mock.writes[1].record.expiry, new Date(now + 600000).toISOString());
}
{
  const mock = pds(); mock.state.failStatus = true;
  await assert.rejects(runPlay(mock), /status unavailable/);
  mock.state.failStatus = false; await runPlay(mock, now + 1000);
  assert.equal(mock.writes.filter(w => w.rkey === key).length, 1);
  assert.equal(mock.writes.filter(w => w.rkey === "self").length, 1);
}
{
  const mock = pds(); await runPlay(mock, now + 600000);
  assert.equal(mock.writes.length, 1);
}
{
  const mock = pds(); mock.state.raceStatus = true;
  await assert.rejects(runStatus(mock), /InvalidSwap/); await runStatus(mock);
  assert.equal(mock.writes.length, 0);
  assert.equal(mock.records.get("fm.teal.actor.status/self").cid, "newer");
}
{
  const mock = pds(); mock.state.failRead = true;
  await assert.rejects(runPlay(mock), /PDS unavailable/);
  await assert.rejects(runStatus(mock), /PDS unavailable/);
  assert.equal(mock.writes.length, 0);
}
{
  const mock = pds(); mock.records.set("fm.teal.feed.play/external", { uri: "external", cid: "external", value: record });
  await runPlay(mock); assert.equal(mock.writes.length, 0);
}
console.log("Verified six durable teal.fm publication scenarios against compiled PureScript.");
