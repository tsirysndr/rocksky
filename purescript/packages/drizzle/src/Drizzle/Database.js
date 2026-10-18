export const executeImpl = (db) => (q) => () => Promise.resolve(db.execute(q)).then(() => undefined);

// node-postgres returns { rows }, the others return the array itself.
export const executeRowsImpl = (db) => (q) => () =>
  Promise.resolve(db.execute(q)).then((r) => (Array.isArray(r) ? r : (r && r.rows) || []));

export const transactionImpl = (db, f) => db.transaction((tx) => f(tx));

export const executeResultImpl = db => q => () => Promise.resolve(db.execute(q));
