import { getTableColumns, SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { tables } from '../../build/dev/javascript/rocksky_api/rocksky_api/drizzle/schema_ffi.mjs';

const quote = value => '"' + value.replaceAll('"','""') + '"';
// Each caller owns its connection: all fixtures disappear when it closes.
export async function createTables(client, names) {
  await client.query(`CREATE FUNCTION pg_temp.xata_id() RETURNS text LANGUAGE SQL AS 'SELECT md5(random()::text)'; SET search_path = pg_temp, public`);
  const dialect = new PgDialect();
  for (const name of names) {
    const columns=Object.values(getTableColumns(tables[name])).map(c=>{
      let definition=`${quote(c.name)} ${c.getSQLType()}`;
      if(c.primary) definition+=' PRIMARY KEY';
      if(c.notNull) definition+=' NOT NULL';
      if(c.default !== undefined) {
        let value;
        if(c.default instanceof SQL) {
          const compiled=dialect.sqlToQuery(c.default);
          if(compiled.params.length) throw new Error('Unsupported fixture default');
          value=compiled.sql.replaceAll("xata_id()", "md5(random()::text)");
        } else if(typeof c.default==='string') value="'"+c.default.replaceAll("'","''")+"'";
        else value=String(c.default);
        definition+=' DEFAULT '+value;
      }
      return definition;
    });
    await client.query(`CREATE TEMP TABLE ${quote(name)} (${columns.join(',')})`);
  }
}
