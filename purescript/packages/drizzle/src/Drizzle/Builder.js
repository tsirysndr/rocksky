import { aliasedTable } from "drizzle-orm";

// Every query is a plain description; drizzle builders are created only when
// the query runs (or renders), because they mutate on each call.

const sel = (base, step) => ({ steps: [...base.steps, step] });

export const selectFrom = (table) => ({ steps: [(db) => db.select().from(table)] });
export const selectFieldsFrom = (fields) => (table) => ({ steps: [(db) => db.select(fields).from(table)] });
export const selectFieldsFromSub = (fields) => (sq) => ({ steps: [(db) => db.select(fields).from(sq)] });
export const selectDistinctFields = (fields) => (table) => ({ steps: [(db) => db.selectDistinct(fields).from(table)] });

export const innerJoin = (table) => (on) => (q) => sel(q, (b) => b.innerJoin(table, on));
export const leftJoin = (table) => (on) => (q) => sel(q, (b) => b.leftJoin(table, on));
export const innerJoinSub = (sq) => (on) => (q) => sel(q, (b) => b.innerJoin(sq, on));
export const leftJoinSub = (sq) => (on) => (q) => sel(q, (b) => b.leftJoin(sq, on));

export const whereImpl = (cond) => (q) => sel(q, (b) => b.where(cond));
export const groupBy = (xs) => (q) => (xs.length === 0 ? q : sel(q, (b) => b.groupBy(...xs)));
export const having = (cond) => (q) => sel(q, (b) => b.having(cond));
export const orderBy = (xs) => (q) => (xs.length === 0 ? q : sel(q, (b) => b.orderBy(...xs)));
export const limit = (n) => (q) => sel(q, (b) => b.limit(n));
export const offset = (n) => (q) => sel(q, (b) => b.offset(n));

const build = (db, q) => {
  let b = q.steps[0](db);
  for (let i = 1; i < q.steps.length; i++) b = q.steps[i](b);
  return b;
};

// A subquery needs a concrete builder, so it is built eagerly against the
// database it will run on. Drizzle subqueries are immutable once named.
export const asImpl = (db) => (name) => (q) => build(db, q).as(name);

export const aliasTable = (table) => (name) => aliasedTable(table, name);

const exec = (b) => Promise.resolve(b.execute ? b.execute() : b);

export const runImpl = (db) => (q) => () => exec(build(db, q));
export const toQuery = (db) => (q) => build(db, q).toSQL();

// Insert

export const insertImpl = (table) => (rows) => ({ table, rows, conflict: null });

export const onConflictDoNothing = (q) => ({ ...q, conflict: { kind: "nothing" } });
export const onConflictDoNothingOn = (target) => (q) => ({ ...q, conflict: { kind: "nothing", target } });
export const onConflictDoUpdateImpl = (target) => (set) => (where) => (q) => ({
  ...q,
  conflict: { kind: "update", target, set, where },
});

const buildInsert = (db, q) => {
  let b = db.insert(q.table).values(q.rows);
  const c = q.conflict;
  if (c && c.kind === "nothing") b = c.target ? b.onConflictDoNothing({ target: c.target }) : b.onConflictDoNothing();
  if (c && c.kind === "update") {
    const opts = { target: c.target, set: c.set };
    if (c.where !== null) opts.where = c.where;
    b = b.onConflictDoUpdate(opts);
  }
  return b;
};

export const runInsertImpl = (db) => (q) => () =>
  q.rows.length === 0 ? Promise.resolve() : exec(buildInsert(db, q)).then(() => undefined);
export const runInsertReturningImpl = (db) => (q) => () =>
  q.rows.length === 0 ? Promise.resolve([]) : exec(buildInsert(db, q).returning());

// Update

export const updateImpl = (table) => (changes) => ({ table, changes, cond: null });
export const updateWhereImpl = (cond) => (q) => ({ ...q, cond });

const buildUpdate = (db, q) => {
  const b = db.update(q.table).set(q.changes);
  return q.cond === null ? b : b.where(q.cond);
};

export const runUpdateImpl = (db) => (q) => () => exec(buildUpdate(db, q)).then(() => undefined);
export const runUpdateReturningImpl = (db) => (q) => () => exec(buildUpdate(db, q).returning());

// Delete

export const deleteFrom = (table) => ({ table, cond: null });
export const deleteWhereImpl = (cond) => (q) => ({ ...q, cond });

const buildDelete = (db, q) => {
  const b = db.delete(q.table);
  return q.cond === null ? b : b.where(q.cond);
};

export const runDeleteImpl = (db) => (q) => () => exec(buildDelete(db, q)).then(() => undefined);
export const runDeleteReturningImpl = (db) => (q) => () => exec(buildDelete(db, q).returning());

export const querySQL = db => q => build(db, q).getSQL();

export const offsetNumber = offset;

export const limitNumber = limit;
