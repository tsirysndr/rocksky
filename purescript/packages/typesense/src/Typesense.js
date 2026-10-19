import Typesense from "typesense";

export const createClient = (cfg) => () => {
  const client = new Typesense.Client({
    nodes: [{ host: cfg.host, port: cfg.port, protocol: cfg.protocol }],
    apiKey: cfg.apiKey,
    connectionTimeoutSeconds: cfg.connectionTimeoutSeconds,
    numRetries: 0,
  });
  // The installed SDK falls back to three when numRetries is zero.
  // Keep retries exclusively in Rocksky.Typesense.Retry.
  client.configuration.numRetries = 0;
  client.apiCall.numRetriesPerRequest = 0;
  return client;
};

const clean = (p) => {
  const r = {};
  for (const [k, v] of Object.entries(p)) if (v !== null && v !== undefined) r[k] = v;
  return r;
};

export const collectionExistsImpl = (c) => (name) => () =>
  c.collections(name).retrieve().then(() => true, (error) => {
    if (error?.httpStatus === 404 || error?.name === "ObjectNotFound") return false;
    throw error;
  });
export const createCollectionImpl = (c) => (schema) => () => c.collections().create(schema).then(() => undefined);
export const deleteCollectionImpl = (c) => (name) => () => c.collections(name).delete().then(() => undefined);
export const importDocumentsImpl = (c) => (name) => (docs) => (action) => () =>
  docs.length === 0 ? Promise.resolve([]) : c.collections(name).documents().import(docs, { action });
export const upsertDocumentImpl = (c) => (name) => (doc) => () => c.collections(name).documents().upsert(doc).then(() => undefined);
export const deleteDocumentImpl = (c) => (name) => (id) => () => c.collections(name).documents(id).delete().then(() => undefined);
export const deleteDocumentsByImpl = (c) => (name) => (filter_by) => () => c.collections(name).documents().delete({ filter_by }).then(() => undefined);
export const searchImpl = (c) => (name) => (params) => () => c.collections(name).documents().search(clean(params));
export const multiSearchImpl = (c) => (searches) => () =>
  c.multiSearch.perform({ searches: searches.map(clean) }).then((r) => r.results ?? []);
