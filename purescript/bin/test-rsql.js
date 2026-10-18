import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
const R = await import("../output/Rocksky.Lib.Rsql/index.js");
const { Just, Nothing } = await import("../output/Data.Maybe/index.js");
const { fromAff } = await import("../output/Control.Promise/index.js");
const fields = {
  title: R.field(sql.identifier("title")),
  year: { column: sql.identifier("year"), type_: R.NumberField.value },
  date: { column: sql.identifier("date"), type_: R.DateField.value },
  tags: { column: sql.identifier("tags"), type_: R.StringArrayField.value },
};
const dialect = new PgDialect();
function compile(text) {
  const result = R.compileRsqlFilter(text)(fields)();
  assert.equal(result.constructor.name, "Right", String(result.value0));
  return dialect.sqlToQuery(result.value0);
}
assert.deepEqual(compile("title==Hello"), { sql: '"title" = $1', params: ["Hello"], typings: ["none"] });
const wildcard = compile('title=="a%_*b"');
assert.equal(wildcard.sql, 'lower("title") LIKE lower($1)');
assert.deepEqual(wildcard.params, ["a\\%\\_%b"]);
assert.equal(compile("title!=null").sql, '"title" is not null');
assert.equal(compile("tags==Rock").sql, '"tags" @> ARRAY[$1]::text[]');
assert.equal(compile("tags=out=(Rock,Jazz)").sql, 'not "tags" && ARRAY[$1, $2]::text[]');
assert.deepEqual(compile("year=in=(2020,2021)").params, [2020, 2021]);
assert.deepEqual(compile("year==0x100000000").params, [4294967296]);
assert.deepEqual(compile('year==""').params, [0]);
assert.ok(compile("year>=2020;title==Rock,title==Jazz").sql.includes(" or "));
assert.equal(compile("date>=2025-01-01").params[0].toISOString(), "2025-01-01T00:00:00.000Z");
for (const text of ["unknown==x", "year==NaN", "year==1e999", "date==invalid", "tags>Rock", "title=custom=x", "not syntax", "title==(a,b)", "title=in=a"]) {
  assert.equal(R.compileRsqlFilter(text)(fields)().constructor.name, "Left", text);
  await assert.rejects(fromAff(R.compileRsqlFilterParam(new Just(text))(fields))(), error => error.customErrorName === "InvalidFilter");
}
assert.equal((await fromAff(R.compileRsqlFilterParam(new Just("  "))(fields))()).constructor.name, "Nothing");
assert.deepEqual(R.rsqlSelectors(new Just("year>2000;title==Rock;year<2025")), ["year", "title"]);
assert.deepEqual(R.rsqlSelectors(new Just("not syntax")), []);
assert.deepEqual(R.rsqlSelectors(Nothing.value), []);
console.log("Verified RSQL allowlists, logical nesting, parameter binding, wildcard escaping, numeric/date coercion, arrays and InvalidFilter errors.");
