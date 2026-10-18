// Queries are described on the PureScript side as plain records and only
// turned into drizzle builders here. Drizzle builders mutate themselves on
// every call, so building them lazily keeps the PureScript values pure.

const applyWhere = (q, cond) => (cond === null ? q : q.where(cond));

const buildSelect = (db, cfg) => {
  let q = db.select().from(cfg.table);
  q = applyWhere(q, cfg.cond);
  if (cfg.orderBy.length > 0) q = q.orderBy(...cfg.orderBy);
  if (cfg.limit !== null) q = q.limit(cfg.limit);
  if (cfg.offset !== null) q = q.offset(cfg.offset);
  return q;
};

const buildInsert = (db, cfg) => db.insert(cfg.table).values(cfg.rows);
const buildUpdate = (db, cfg) => applyWhere(db.update(cfg.table).set(cfg.changes), cfg.cond);
const buildDelete = (db, cfg) => applyWhere(db.delete(cfg.table), cfg.cond);

// `execute()` returns a promise for every driver, including synchronous
// SQLite ones; Promise.resolve normalises any thenable into a real Promise.
const run = (q) => Promise.resolve(q.execute());
const runUnit = (q) => run(q).then(() => undefined);

// Execution

export const selectImpl = (db) => (cfg) => () => run(buildSelect(db, cfg));

export const insertImpl = (db) => (cfg) => () =>
  cfg.rows.length === 0 ? Promise.resolve() : runUnit(buildInsert(db, cfg));

export const insertReturningImpl = (db) => (cfg) => () =>
  cfg.rows.length === 0 ? Promise.resolve([]) : run(buildInsert(db, cfg).returning());

export const updateImpl = (db) => (cfg) => () => runUnit(buildUpdate(db, cfg));
export const updateReturningImpl = (db) => (cfg) => () => run(buildUpdate(db, cfg).returning());

export const deleteImpl = (db) => (cfg) => () => runUnit(buildDelete(db, cfg));
export const deleteReturningImpl = (db) => (cfg) => () => run(buildDelete(db, cfg).returning());

// Rendering (pure: building a drizzle query has no side effects)

const empty = { sql: "", params: [] };

export const selectQuery = (db) => (cfg) => buildSelect(db, cfg).toSQL();
export const insertQuery = (db) => (cfg) => (cfg.rows.length === 0 ? empty : buildInsert(db, cfg).toSQL());
export const updateQuery = (db) => (cfg) => buildUpdate(db, cfg).toSQL();
export const deleteQuery = (db) => (cfg) => buildDelete(db, cfg).toSQL();
