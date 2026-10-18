import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { run } from '../build/dev/javascript/gleam_stdlib/gleam/dynamic/decode.mjs';
import { Ok } from '../build/dev/javascript/rocksky_api/gleam.mjs';

const tables = JSON.parse(readFileSync(new URL('../../tools/schemagen/schema.json', import.meta.url)));
for (const table of tables.filter(t => t.columns.some(c => c.name === 'xata_version' && c.columnType === 'PgText'))) {
  test(`${table.table} accepts production integer and local text version metadata`, async () => {
    const { decoder } = await import(`../build/dev/javascript/rocksky_api/rocksky_api/schema/${table.file.replaceAll('-', '_')}.mjs`);
    const row = Object.fromEntries(table.columns.map(c => [c.name, !c.notNull ? null :
      c.columnType === 'PgText' ? 'test' : c.columnType === 'PgBoolean' ? true :
      c.columnType === 'PgTimestamp' ? new Date() : c.columnType === 'PgArray' ? [] : 1]));
    for (const value of [1, 42, '42', null, undefined]) {
      const input = { ...row, xata_version: value };
      if (value === undefined) delete input.xata_version;
      const result = run(input, decoder());
      assert.ok(result instanceof Ok, JSON.stringify(result));
      if (value != null) assert.equal(result[0].xata_version[0], String(value));
    }
    assert.ok(!(run({ ...row, xata_version: {} }, decoder()) instanceof Ok));
    // Keep normal text columns strict; this coercion applies only to metadata.
    assert.ok(!(run({ ...row, xata_id: 42 }, decoder()) instanceof Ok));
  });
}
