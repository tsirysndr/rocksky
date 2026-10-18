import Typesense from "typesense";
import { Ok, Error as GError } from "../../gleam.mjs";

const wrap = (p) => Promise.resolve(p).then((v) => new Ok(v), (e) => new GError(e));

export const client = (host, port, protocol, apiKey, timeout) =>
  new Typesense.Client({ nodes: [{ host, port, protocol }], apiKey, connectionTimeoutSeconds: timeout, numRetries: 0 });
export const createCollection = (c, schema) => wrap(c.collections().create(schema));
export const retrieveCollection = (c, name) => wrap(c.collections(name).retrieve());
export const deleteCollection = (c, name) => wrap(c.collections(name).delete());
export const importDocuments = (c, name, docs, action) =>
  wrap(c.collections(name).documents().import(docs, { action }));
export const upsertDocument = (c, name, doc) => wrap(c.collections(name).documents().upsert(doc));
export const deleteDocument = (c, name, id) => wrap(c.collections(name).documents(id).delete());
export const deleteDocuments = (c, name, filterBy) =>
  wrap(c.collections(name).documents().delete({ filter_by: filterBy }));
export const search = (c, name, params) => wrap(c.collections(name).documents().search(params));
export const multiSearch = (c, searches, common) => wrap(c.multiSearch.perform(searches, common));
export const isNotFound = (e) => e?.httpStatus === 404 || e?.name === "ObjectNotFound";
export const isAlreadyExists = (e) => e?.httpStatus === 409 || e?.name === "ObjectAlreadyExists";
