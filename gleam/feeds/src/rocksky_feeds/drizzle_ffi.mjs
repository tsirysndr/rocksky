import {sql} from 'drizzle-orm';
import {drizzle} from 'drizzle-orm/node-postgres';
import {PgDialect,pgTable,text as textColumn,timestamp} from 'drizzle-orm/pg-core';
import {Ok,Error as GleamError,toList} from '../../gleam_stdlib/gleam.mjs';
import {None,Some} from '../../gleam_stdlib/gleam/option.mjs';
import {Row,Query} from './types.mjs';
import {db_span} from './telemetry_ffi.mjs';
const tables={
 artists:pgTable('artists',{id:textColumn('xata_id').primaryKey(),genres:textColumn('genres').array()}),
 scrobbles:pgTable('scrobbles',{uri:textColumn('uri'),artistId:textColumn('artist_id'),timestamp:timestamp('timestamp').notNull()}),
};
const dialect=new PgDialect();
export const connection=pool=>({db:drizzle(pool),end:()=>pool.end()});
export const raw=sql.raw;
export const text=value=>sql`${value}`;
export const integer=value=>sql`${value}`;
export const table=name=>{if(!Object.hasOwn(tables,name))throw new Error('Unknown feed table');return sql`${tables[name]}`;};
export const join=parts=>sql.join(Array.from(parts),sql.raw(''));
export const compile=statement=>{const compiled=dialect.sqlToQuery(statement);return new Query(compiled.sql,toList(compiled.params.map(String)),statement);};
export const execute=(database,query)=>db_span(query.sql,async()=>{
 try{
  const {rows}=await database.db.execute(query.statement);
  return new Ok(toList(rows.map(row=>new Row(row.uri==null?new None():new Some(row.uri),Math.trunc(Number(row.timestampMs))))));
 }catch{return new GleamError('PostgreSQL query failed');}
});
