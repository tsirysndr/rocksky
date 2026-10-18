import { Agent, AtpAgent } from "@atproto/api";
import { Ok, Error as GError, toList, BitArray } from "../../gleam.mjs";
import { Some, None } from "../../../gleam_stdlib/gleam/option.mjs";
import { RecordRef, Record, RecordPage } from "./agent.mjs";

const opt = (v) => (v === undefined || v === null ? new None() : new Some(v));
const unwrap = (o) => (o instanceof Some ? o[0] : undefined);
const wrap = (p, f = (v) => v) => Promise.resolve(p).then((v) => new Ok(f(v)), (e) => new GError(e));

export const fromSession = (session) => new Agent(session);
export const atpAgent = (service) => new AtpAgent({ service: new URL(service) });
export const resumeSession = (agent, session) => wrap(agent.resumeSession(session), () => undefined);
export const login = (agent, identifier, password) =>
  wrap(agent.login({ identifier, password }), () => undefined);
export const session = (agent) => agent.session;
export const did = (agent) => opt(agent.did ?? agent.session?.did);
export const resolveHandle = (agent, handle) =>
  wrap(agent.resolveHandle({ handle }), (r) => r.data.did);
export const getProfile = (agent, actor) =>
  wrap(agent.app.bsky.actor.getProfile({ actor }), (r) => r.data);
export const getPreferences = (agent) => wrap(agent.getPreferences());
export const putRecord = (agent, repo, collection, rkey, record, swapRecord) =>
  wrap(
    agent.com.atproto.repo.putRecord({
      repo,
      collection,
      rkey,
      record,
      ...(swapRecord instanceof Some ? { swapRecord: swapRecord[0] } : {}),
    }),
    (r) => new RecordRef(r.data.uri, r.data.cid),
  );
export const createRecord = (agent, repo, collection, rkey, record) =>
  wrap(
    agent.com.atproto.repo.createRecord({ repo, collection, rkey: unwrap(rkey), record }),
    (r) => new RecordRef(r.data.uri, r.data.cid),
  );
export const getRecord = (agent, repo, collection, rkey) =>
  wrap(
    agent.com.atproto.repo.getRecord({ repo, collection, rkey }),
    (r) => new Record(r.data.uri, opt(r.data.cid), r.data.value),
  );
export const deleteRecord = (agent, repo, collection, rkey) =>
  wrap(agent.com.atproto.repo.deleteRecord({ repo, collection, rkey }), () => undefined);
export const listRecords = (agent, repo, collection, limit, cursor, reverse) =>
  wrap(
    agent.com.atproto.repo.listRecords({ repo, collection, limit, cursor: unwrap(cursor), reverse }),
    (r) =>
      new RecordPage(
        toList(r.data.records.map((x) => new Record(x.uri, opt(x.cid), x.value))),
        opt(r.data.cursor),
      ),
  );
export const uploadBlob = (agent, data, mimeType) =>
  wrap(
    agent.com.atproto.repo.uploadBlob(new Uint8Array(data.rawBuffer ?? data.buffer), { encoding: mimeType }),
    (r) => r.data.blob,
  );
export const applyWrites = (agent, repo, writes) =>
  wrap(agent.com.atproto.repo.applyWrites({ repo, writes }), () => undefined);
export const isSessionRejected = (e) => {
  if (typeof e !== "object" || e === null) return false;
  const { status, error } = e;
  if (status !== 400 && status !== 401) return false;
  return error === "ExpiredToken" || error === "InvalidToken" || error === "AccountTakedown";
};
export const xrpcErrorName = (e) => opt(typeof e?.error === "string" ? e.error : undefined);
export const lastSegment = (uri) => uri.split("/").pop() ?? "";

export const putRecordUnchecked = (agent, repo, collection, rkey, record, swapRecord) =>
  wrap(agent.com.atproto.repo.putRecord({ repo, collection, rkey, record, validate: false,
    ...(swapRecord instanceof Some ? { swapRecord: swapRecord[0] } : {}) }),
    r => new RecordRef(r.data.uri, r.data.cid));

export const createRecordUnchecked = (agent, repo, collection, rkey, record) =>
  wrap(agent.com.atproto.repo.createRecord({ repo, collection, rkey, record, validate: false }),
    r => new RecordRef(r.data.uri, r.data.cid));

export const putRecordCreateOnly = (agent, repo, collection, rkey, record, createOnly) =>
  wrap(agent.com.atproto.repo.putRecord({repo, collection, rkey, record, validate:false, ...(createOnly ? {swapRecord:null} : {})}), r => new RecordRef(r.data.uri,r.data.cid));
export const putRecordCas = (agent,repo,collection,rkey,record,expected) =>
  wrap(agent.com.atproto.repo.putRecord({repo,collection,rkey,record,swapRecord:expected instanceof Some ? expected[0] : null}),r=>new RecordRef(r.data.uri,r.data.cid));
