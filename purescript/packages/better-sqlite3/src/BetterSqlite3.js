import Database from "better-sqlite3";
export const open = (location) => () => new Database(location, { fileMustExist: false });
export const pragma = (db) => (p) => () => {
  db.pragma(p);
};
export const exec = (db) => (sql) => () => {
  db.exec(sql);
};
export const close = (db) => () => db.close();
