import Database from "better-sqlite3";
import { Ok, Error as GError, toList } from "../../gleam.mjs";

export const open = (location) => new Database(location, { fileMustExist: false });
export const pragma = (db, s) => {
  db.pragma(s);
};
export const exec = (db, sql) => {
  try {
    db.exec(sql);
    return new Ok(undefined);
  } catch (e) {
    return new GError(e);
  }
};
export const run = (db, sql, params) => {
  try {
    return new Ok(db.prepare(sql).run(...params.toArray()).changes);
  } catch (e) {
    return new GError(e);
  }
};
export const all = (db, sql, params) => {
  try {
    return new Ok(toList(db.prepare(sql).all(...params.toArray())));
  } catch (e) {
    return new GError(e);
  }
};
export const close = (db) => db.close();
const BUSY = new Set(["SQLITE_BUSY", "SQLITE_BUSY_SNAPSHOT", "SQLITE_LOCKED", "SQLITE_PROTOCOL"]);
export const isBusy = (e) => BUSY.has(e?.code ?? "");
