import { describe, expect, it } from "bun:test";
import * as Status from "lexicon/types/fm/teal/actor/status";
import type { Agent } from "@atproto/api";
import {
  publishTealRecord,
  publishTealStatus,
  tealRecord,
} from "./publication";

const now = Date.parse("2026-10-15T15:00:00Z");
const record = tealRecord(
  {
    name: "September",
    album: "The Best",
    timestamp: new Date(now).toISOString(),
    artist: [{ id: "a", name: "Earth, Wind & Fire", mbid: "" }],
    trackMBID: "",
    releaseMBID: "",
  },
  215,
);
const key = "3mv234567abcd";
const missing = () =>
  Object.assign(new Error("missing"), { error: "RecordNotFound" });
function pds() {
  const records = new Map<string, { uri: string; cid: string; value: any }>();
  const writes: any[] = [];
  let losePlayAck = false;
  let failStatus = false;
  let raceStatus = false;
  let failRead = false;
  const repo = {
    async getRecord({ collection, rkey }: any) {
      if (failRead) throw new Error("PDS unavailable");
      const data = records.get(`${collection}/${rkey}`);
      if (!data) throw missing();
      return { data };
    },
    async listRecords({ collection }: any) {
      return {
        data: {
          records: [...records.entries()]
            .filter(([k]) => k.startsWith(collection + "/"))
            .map(([, v]) => v),
        },
      };
    },
    async putRecord(input: any) {
      const id = `${input.collection}/${input.rkey}`;
      const status = input.rkey === "self";
      if (status && failStatus) throw new Error("status unavailable");
      if (status && raceStatus) {
        raceStatus = false;
        records.set(id, {
          uri: id,
          cid: "newer",
          value: { time: new Date(now + 1000).toISOString() },
        });
      }
      const existing = records.get(id);
      if (input.swapRecord !== (existing?.cid ?? null))
        throw new Error("InvalidSwap");
      writes.push(input);
      const data = {
        uri: id,
        cid: `cid-${writes.length}`,
        value: input.record,
      };
      records.set(id, data);
      if (!status && losePlayAck) {
        losePlayAck = false;
        throw new Error("lost acknowledgement");
      }
      return { data };
    },
  };
  return {
    agent: {
      assertDid: "did:plc:test",
      com: { atproto: { repo } },
    } as unknown as Agent,
    records,
    writes,
    set losePlayAck(v: boolean) {
      losePlayAck = v;
    },
    set failStatus(v: boolean) {
      failStatus = v;
    },
    set raceStatus(v: boolean) {
      raceStatus = v;
    },
    set failRead(v: boolean) {
      failRead = v;
    },
  };
}

describe("durable Teal publication", () => {
  it("recovers a lost play acknowledgement and never regenerates its key or listening time", async () => {
    const mock = pds();
    mock.losePlayAck = true;
    await publishTealRecord(mock.agent, record, key, now);
    await publishTealRecord(mock.agent, record, key, now + 5000);
    expect(mock.writes).toHaveLength(2);
    expect(mock.writes[0].rkey).toBe(key);
    expect(mock.writes[0].record.playedTime).toBe(record.playedTime);
    expect(Status.validateRecord(mock.writes[1].record).success).toBe(true);
    expect(mock.writes[1].record.expiry).toBe(
      new Date(now + 600000).toISOString(),
    );
  });
  it("retries status independently after the play already succeeded", async () => {
    const mock = pds();
    mock.failStatus = true;
    await expect(
      publishTealRecord(mock.agent, record, key, now),
    ).rejects.toThrow("status unavailable");
    mock.failStatus = false;
    await publishTealRecord(mock.agent, record, key, now + 1000);
    expect(mock.writes.filter((w) => w.rkey === key)).toHaveLength(1);
    expect(mock.writes.filter((w) => w.rkey === "self")).toHaveLength(1);
  });
  it("publishes historical plays without reviving expired now-playing status", async () => {
    const mock = pds();
    await publishTealRecord(mock.agent, record, key, now + 600000);
    expect(mock.writes).toHaveLength(1);
  });
  it("does not replace a newer status, including a concurrent CAS race", async () => {
    const mock = pds();
    mock.raceStatus = true;
    await expect(publishTealStatus(mock.agent, record, now)).rejects.toThrow(
      "InvalidSwap",
    );
    await publishTealStatus(mock.agent, record, now);
    expect(mock.writes).toHaveLength(0);
    expect(mock.records.get("fm.teal.actor.status/self")?.cid).toBe("newer");
  });
  it("does not interpret read/auth failures as missing records", async () => {
    const mock = pds();
    mock.failRead = true;
    await expect(
      publishTealRecord(mock.agent, record, key, now),
    ).rejects.toThrow("PDS unavailable");
    await expect(publishTealStatus(mock.agent, record, now)).rejects.toThrow(
      "PDS unavailable",
    );
    expect(mock.writes).toHaveLength(0);
  });
  it("does not echo an existing external Teal play", async () => {
    const mock = pds();
    mock.records.set("fm.teal.feed.play/external", {
      uri: "external",
      cid: "external",
      value: record,
    });
    await publishTealRecord(mock.agent, record, key, now);
    expect(mock.writes).toHaveLength(0);
  });
});
