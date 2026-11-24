import { Database, type SQLQueryBindings } from "bun:sqlite";

/** The better-sqlite3 surface used by the CLI's disk cache in compiled builds. */
export default class CompiledDatabase extends Database {
  constructor(
    filename: string,
    options: {
      readonly?: boolean;
      fileMustExist?: boolean;
      timeout?: number;
    } = {},
  ) {
    const readonly = options.readonly === true;
    // Never pass better-sqlite3 options straight to Bun: older release runtimes
    // interpret an object without Bun's open-mode keys as SQLite flags = 0.
    super(filename, {
      readonly,
      readwrite: !readonly,
      create: !readonly && !options.fileMustExist,
    });
    this.exec(
      `PRAGMA busy_timeout = ${Math.max(0, Math.trunc(options.timeout ?? 5000))}`,
    );
  }

  pragma(source: string, options: { simple?: boolean } = {}) {
    const rows = this.prepare(`PRAGMA ${source}`).all() as Record<
      string,
      unknown
    >[];
    return options.simple ? Object.values(rows[0] ?? {})[0] : rows;
  }

  prepare<Result, Params extends SQLQueryBindings | SQLQueryBindings[]>(
    sql: string,
    params?: Params,
  ) {
    const statement = super.prepare<Result, Params>(sql, params);
    // Kysely uses better-sqlite3's reader flag to choose all() versus run().
    // Bun 1.4.3 lacks it; without this SELECT silently returns no rows.
    if (typeof (statement as { reader?: boolean }).reader !== "boolean") {
      Object.defineProperty(statement, "reader", {
        get: () => statement.columnNames.length > 0,
      });
    }
    return statement;
  }
}
