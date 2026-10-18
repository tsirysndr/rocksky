import { Agent, AtpAgent } from "@atproto/api";

export const newAtpAgent = (service) => () => new AtpAgent({ service });
export const newAgentFromSession = (session) => () => new Agent(session);
export const assertDid = (a) => () => a.assertDid;
export const didImpl = (a) => a.did ?? null;
export const sessionJson = (a) => () => JSON.stringify(a.session);
export const resumeSessionImpl = (a) => (json) => () => a.resumeSession(JSON.parse(json)).then(() => undefined);
export const loginImpl = (a) => (identifier) => (password) => () => a.login({ identifier, password }).then(() => undefined);
export const getPreferencesImpl = (a) => () => a.getPreferences();
export const resolveHandleImpl = (a) => (handle) => () => a.resolveHandle({ handle }).then((r) => r.data.did);
export const getBskyProfileImpl = (a) => (actor) => () =>
  a.app.bsky.actor.getProfile({ actor }).then(({ data }) => ({
    did: data.did,
    handle: data.handle,
    displayName: data.displayName ?? null,
    avatar: data.avatar ?? null,
    description: data.description ?? null,
  }));

const isJust = (m) => m && m.constructor && m.constructor.name === "Just";

export const encodePutRecord = (i) => {
  const o = { repo: i.repo, collection: i.collection, rkey: i.rkey, record: i.record, validate: i.validate };
  if (isJust(i.swapRecord)) o.swapRecord = isJust(i.swapRecord.value0) ? i.swapRecord.value0.value0 : null;
  return o;
};
export const putRecordImpl = (a) => (input) => () => a.com.atproto.repo.putRecord(input).then((r) => ({ uri: r.data.uri, cid: r.data.cid }));
export const createRecordImpl = (a) => (i) => () => {
  const o = { repo: i.repo, collection: i.collection, record: i.record, validate: i.validate };
  if (i.rkey !== null) o.rkey = i.rkey;
  return a.com.atproto.repo.createRecord(o).then((r) => ({ uri: r.data.uri, cid: r.data.cid }));
};
export const getRecordImpl = (a) => (repo) => (collection) => (rkey) => () =>
  a.com.atproto.repo.getRecord({ repo, collection, rkey }).then((r) => ({ uri: r.data.uri, cid: r.data.cid ?? null, value: r.data.value }));
export const deleteRecordImpl = (a) => (repo) => (collection) => (rkey) => () =>
  a.com.atproto.repo.deleteRecord({ repo, collection, rkey }).then(() => undefined);
export const listRecordsImpl = (a) => (repo) => (collection) => (limit) => (cursor) => () => {
  const o = { repo, collection, limit };
  if (cursor !== null) o.cursor = cursor;
  return a.com.atproto.repo.listRecords(o).then((r) => ({ records: r.data.records, cursor: r.data.cursor ?? null }));
};
export const uploadBlobImpl = (a) => (bytes) => (encoding) => () => a.com.atproto.repo.uploadBlob(bytes, { encoding }).then((r) => r.data.blob);
export const applyWritesImpl = (a) => (repo) => (writes) => () => a.com.atproto.repo.applyWrites({ repo, writes }).then(() => undefined);

export const xrpcErrorNameImpl = (e) => (e && typeof e === "object" && typeof e.error === "string" ? e.error : null);
export const xrpcErrorStatusImpl = (e) => (e && typeof e === "object" && typeof e.status === "number" ? e.status : null);
