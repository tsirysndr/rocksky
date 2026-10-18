import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

export const createPool = (cfg) => () => new pg.Pool(cfg);
export const connectImpl = (pool) => () => pool.connect();
export const release = (client) => () => client.release();
export const releaseDestroy = (client) => () => client.release(true);

const result = (r) => ({ rows: r.rows, rowCount: r.rowCount ?? null });

export const queryImpl = (pool, sql) => pool.query(sql).then(result);
export const queryParamsImpl = (pool) => (sql) => (params) => () => pool.query(sql, params).then(result);
export const clientQueryImpl = (client, sql) => client.query(sql).then(result);
export const clientQueryParamsImpl = (client) => (sql) => (params) => () => client.query(sql, params).then(result);

export const onPoolErrorImpl = (pool, f) => {
  pool.on("error", (e) => f(e));
};
export const onPoolConnectImpl = (pool, f) => {
  pool.on("connect", (c) => f(c));
};
export const onClientErrorImpl = (client, f) => {
  client.on("error", (e) => f(e));
};
export const processIDImpl = (client) => client.processID ?? null;
export const endImpl = (pool) => () => pool.end();

export const drizzleFromPool = (pool) => () => drizzle(pool);
export const drizzleFromClient = (client) => () => drizzle(client);
