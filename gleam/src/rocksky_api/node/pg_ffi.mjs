import pg from "pg";
import { Ok, Error as GError, toList } from "../../gleam.mjs";
import { Some, None } from "../../../gleam_stdlib/gleam/option.mjs";

// int8 / numeric / float come back as JS numbers rather than strings.
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));
pg.types.setTypeParser(700, (v) => Number(v));
pg.types.setTypeParser(701, (v) => Number(v));

const unwrap = (opt) => (opt instanceof Some ? opt[0] : undefined);

export const newPool = (c) =>
  new pg.Pool({
    connectionString: c.connection_string,
    max: c.max,
    idleTimeoutMillis: c.idle_timeout_ms,
    connectionTimeoutMillis: c.connection_timeout_ms,
    application_name: c.application_name,
    statement_timeout: unwrap(c.statement_timeout_ms),
    idle_in_transaction_session_timeout: unwrap(c.idle_in_transaction_timeout_ms),
  });

export const watch = (pool, label, report) => {
  pool.on("error", (error) => report(`Idle pg client error on ${label}: ${error.message}`));
  pool.on("connect", (client) => {
    client.on("error", (error) => report(`Pg connection error on ${label}: ${error.message}`));
  });
};

const toResult = (r) => {
  if (Array.isArray(r)) {
    const last = r[r.length - 1];
    return { rows: toList(last?.rows ?? []), row_count: r.reduce((n, x) => n + (x.rowCount ?? 0), 0) };
  }
  return { rows: toList(r.rows ?? []), row_count: r.rowCount ?? 0 };
};
const run = (p) => p.then((r) => new Ok(toResult(r)), (e) => new GError(e));

export const query = (pool, sql, params) => run(pool.query(sql, params.toArray()));
export const connect = (pool) => pool.connect().then((c) => new Ok(c), (e) => new GError(e));
export const clientQuery = (client, sql, params) => run(client.query(sql, params.toArray()));
export const release = (client, destroy) => {
  client.release(destroy || undefined);
};
export const processId = (client) =>
  typeof client.processID === "number" ? new Some(client.processID) : new None();
export const end = (pool) => pool.end();
export const dateFromMs = (ms) => new Date(ms);
export const toMs = (v) => {
  if (v instanceof Date) return isNaN(v.getTime()) ? new None() : new Some(v.getTime());
  if (typeof v === "number") return new Some(v);
  if (typeof v === "string") {
    // `timestamp without time zone` serialised by to_jsonb has no offset.
    const s = /[zZ]|[+-]\d\d:?\d\d$/.test(v) ? v : v + "Z";
    const t = new Date(s).getTime();
    return isNaN(t) ? new None() : new Some(t);
  }
  return new None();
};
