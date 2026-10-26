import * as d from 'drizzle-orm';
import { alias as pgAlias } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/node-postgres';
import { tables } from './schema_ffi.mjs';
import { views } from './views_ffi.mjs';
import { Ok, Error as GError, toList } from '../../gleam.mjs';
import { Some } from '../../../gleam_stdlib/gleam/option.mjs';
import { Compiled } from './orm.mjs';

export const table = name => {
  const value = tables[name] ?? views[name];
  if (!value) throw new Error(`Unknown Drizzle table: ${name}`);
  return value;
};
export const alias = pgAlias;
export const column = (table, property) => {
  const column = table._?.selectedFields ? table[property] : d.getTableColumns(table)[property];
  if (!column) throw new Error(`Unknown Drizzle column: ${property}`);
  if(table._?.selectedFields && d.is(column, d.SQL.Aliased)) {
    return d.sql`${d.sql.identifier(table._.alias)}.${d.sql.identifier(column.fieldAlias)}`.mapWith(column.sql.decoder);
  }
  return column;
};
export const columns = table => table._?.selectedFields
  ? Object.fromEntries(Object.keys(table._.selectedFields).map(key=>[key,column(table,key)]))
  : Object.fromEntries(Object.values(d.getTableColumns(table)).map(c => [c.name, c]));
export const field = (name, value) => ({ [name]: value });
export const merge = (a, b) => {
  for (const key of Object.keys(b)) if (Object.hasOwn(a, key)) throw new Error(`Duplicate selection key: ${key}`);
  return {...a, ...b};
};
export const select = (table, selection) => ({kind:'select',table,selection,joins:[]});
export const where = (q, condition) => ({...q,where:condition});
export const join = (q, kind, table, on) => ({...q,joins:[...q.joins,{kind,table,on}]});
export const limit = (q, limit) => ({...q,limit});
export const offset = (q, offset) => ({...q,offset});
export const order = (q, order) => ({...q,order:order.toArray()});
export const group = (q, group) => ({...q,group:group.toArray()});
export const having = (q, having) => ({...q,having});
export const distinct = q => ({...q,distinct:true});
export const orderExpression = (c, descending) => descending ? d.desc(c) : d.asc(c);
export const compareValue = (column, op, value) => d[op](column,value);
export const compareColumns = (a, op, b) => d[op](a,b);
export const inArray = (column, values, negated) => (negated ? d.notInArray : d.inArray)(column,values.toArray());
export const isNull = (column, negated) => (negated ? d.isNotNull : d.isNull)(column);
export const combine = (conditions, all) => {
  const items=conditions.toArray();
  return items.length ? (all ? d.and : d.or)(...items) : (all ? d.sql`true` : d.sql`false`);
};
const not = d.not;
export { not };
export const exists = (query, negated) => (negated ? d.notExists : d.exists)(build(drizzle.mock(),query));
export const aggregate = (name, column) => {
  const value=column instanceof Some ? column[0] : undefined;
  if (name==='count_all') return d.count();
  if (name==='count_distinct') return d.countDistinct(value);
  return d[name](value);
};
const columnProperty = column => {
  const match=Object.entries(d.getTableColumns(column.table)).find(([,c])=>c.name===column.name);
  if(!match) throw new Error(`Cannot assign column ${column.name}`);
  return match[0];
};
export const assignment = (column,value) => ({column,value});
export const assignmentExpression = assignment;
const values = assignments => Object.fromEntries(assignments.toArray().map(({column,value})=>[columnProperty(column),value]));
export const insert = (table, assignments) => ({kind:'insert',table,values:values(assignments)});
export const insertMany = (table, rows) => ({kind:'insert',table,values:rows.toArray().map(values)});
export const update = (table, assignments, where) => ({kind:'update',table,values:values(assignments),where});
const deleteQuery = (table, where) => ({kind:'delete',table,where});
export { deleteQuery as delete };
export const conflictNothing = q => ({...q, conflict:{kind:'nothing'}});
export const conflictUpdate = (q,target,assignments) => ({...q,conflict:{kind:'update',target:target.toArray(),set:values(assignments)}});
export const returning = q => ({...q,returning:true});
function build(db,q) {
  if(q.kind==='union') return build(db,q.left).unionAll(build(db,q.right));
  let query;
  if(q.kind==='select') {
    const source=q.ctes?.length?db.with(...q.ctes):db;
    query=(q.distinctOn?source.selectDistinctOn(q.distinctOn,q.selection):q.distinct?source.selectDistinct(q.selection):source.select(q.selection));
    query=query.from(q.table ?? d.sql`(select 1) as gleam_single_row`);
    query=query.$dynamic();
    for(const j of q.joins) query=query[j.kind === "leftLateral" ? "leftJoinLateral" : `${j.kind}Join`](j.table,j.on);
    if(q.where) query=query.where(q.where);
    if(q.group) query=query.groupBy(...q.group);
    if(q.having) query=query.having(q.having);
    if(q.order) query=query.orderBy(...q.order);
    if(q.limit!==undefined) query=query.limit(q.limit);
    if(q.offset!==undefined) query=query.offset(q.offset);
  } else {
    if(q.kind==='insert') {
      query=db.insert(q.table).values(q.values);
      if(q.conflict?.kind==='nothing') query=query.onConflictDoNothing();
      if(q.conflict?.kind==='update') query=query.onConflictDoUpdate({target:q.conflict.target,set:q.conflict.set});
    } else if(q.kind==='update') query=db.update(q.table).set(q.values).where(q.where);
    else query=db.delete(q.table).where(q.where);
    if(q.returning) query=query.returning(q.returningSelection ?? columns(q.table));
  }
  return query;
}
const databases = new WeakMap();
const database = pool => {
  let db=databases.get(pool);
  if(!db) { db=drizzle(pool); databases.set(pool,db); }
  return db;
};
export const execute = async (pool, q) => {
  try { return new Ok(toList(await build(database(pool),q).execute())); }
  catch(e) { return new GError(e); }
};
export const run = async (pool,q) => {
  try { const result=await build(database(pool),q).execute(); return new Ok(result.rowCount ?? 0); }
  catch(e) { return new GError(e); }
};
export const compile = q => { const {sql,params}=build(drizzle.mock(),q).toSQL(); return new Compiled(sql,toList(params)); };

export const nowMinusSeconds = seconds => d.sql`now() - ${seconds} * interval '1 second'`;

export const arrayCondition = (column, values, overlap) => (overlap ? d.arrayOverlaps : d.arrayContains)(column, values);
export const castReal = column => d.sql`cast(${column} as double precision)`;

export const aliasExpression = (value, name) => d.is(value, d.SQL) ? value.as(name) : d.sql`${value}`.mapWith(value).as(name);

export const subquery = (query, name) => build(drizzle.mock(),query).as(name);

export const currentYear = () => d.sql`extract(year from current_date)::int`;
export const integerBucket = (column,width) => {
  if(!Number.isSafeInteger(width) || width<=0) throw new Error('Bucket width must be a positive integer');
  const literal=d.sql.raw(String(width));
  return d.sql`(${column} / ${literal}) * ${literal}`;
};

export const coalesce = (first, fallback) => d.sql`coalesce(${first}, ${fallback})`;
export const orderNullsLast = (expression, descending) => descending ? d.sql`${expression} desc nulls last` : d.sql`${expression} asc nulls last`;
export const equalsCaseInsensitive = (expression, value) => d.sql`lower(${expression}) = lower(${value})`;
export const advisoryXactLock = async (pool, key) => {
  try { await database(pool).execute(d.sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`); return new Ok(undefined); }
  catch(e) { return new GError(e); }
};
export const calendarDay = expression => d.sql`date(${expression})::text`;
export const calendarRange = (expression, from, to) => d.sql`${expression} >= ${from}::date and ${expression} < ${to}::date + interval '1 day'`;
export const afterCalendarDay = (expression, day) => d.sql`${expression} >= (${day}::date + 1)::timestamp`;
export const value = value => d.sql`${value}`;
export const hashText = expression => d.sql`hashtext(${expression})`;
export const unnest = expression => d.sql`unnest(${expression})`;
export const unionAll = (left, right) => ({kind:'union',left,right});
export const lower = value => d.sql`lower(${value})`;

export const returningAs = (q,selection) => ({...q,returning:true,returningSelection:selection});

export const commonTable=(query,name)=>drizzle.mock().$with(name).as(build(drizzle.mock(),query));
export const withCommonTable=(query,cte)=>({...query,ctes:[...(query.ctes??[]),cte]});
export const selectValues=selection=>({kind:'select',selection,joins:[]});
export const jsonRows=query=>{
  const selection=Object.fromEntries(Object.entries(query.selection).map(([key,value])=>[key,d.sql`${d.is(value,d.SQL.Aliased)?value.sql:value}`.as(key)]));
  return d.sql`coalesce((select jsonb_agg(gleam_rows) from (${build(drizzle.mock(),{...query,selection})}) gleam_rows), '[]'::jsonb)`;
};
export const scalar=query=>d.sql`(${build(drizzle.mock(),query)})`;
export const multiply=(a,b)=>d.sql`(${a})::bigint * (${b})::bigint`;
export const datePart=(value,part)=>{if(!['hour','month'].includes(part))throw new Error('Unsupported date part');return d.sql`extract(${d.sql.raw(part)} from ${value})::int`;};
export const omitColumn=(selection,column)=>Object.fromEntries(Object.entries(selection).filter(([,value])=>value!==column));

export const distinctOn=(query,columns)=>({...query,distinctOn:columns.toArray()});
export const decayedCount = (at, decay) => d.sql`sum(exp(-(${decay}::double precision) * extract(epoch from (now() - ${at})) / 86400))`;
export const randomOrder = () => d.sql`random()`;
export const tupleGtSubquery=(expressions,query)=>d.sql`(${d.sql.join(expressions.toArray(),d.sql`, `)}) > (${build(drizzle.mock(),query)})`;
export const utcCalendarDay=expression=>d.sql`to_char(${expression} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;

export const countMatching = condition => d.sql`count(*) filter (where ${condition})`.mapWith(Number);
