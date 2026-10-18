import { readdirSync } from "node:fs";
import { getTableColumns, getTableName } from "drizzle-orm";
const dir = new URL("../../apps/api/src/schema/", import.meta.url);
const out: any[] = [];
for (const f of readdirSync(dir).sort()) {
  if (f === "index.ts" || !f.endsWith(".ts")) continue;
  const mod = await import(new URL(f, dir).href);
  const table = mod.default;
  const cols = getTableColumns(table);
  out.push({
    file: f.replace(/\.ts$/, ""),
    table: getTableName(table),
    columns: Object.entries(cols).map(([prop, c]: [string, any]) => ({
      prop, name: c.name, dataType: c.dataType, columnType: c.columnType,
      notNull: c.notNull, hasDefault: c.hasDefault, isArray: c.columnType === "PgArray",
      baseColumn: c.baseColumn?.dataType, enumValues: c.enumValues,
    })),
  });
}
console.log(JSON.stringify(out, null, 1));
