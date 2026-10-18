import 'dotenv/config';
import pg from 'pg';
import { resolve } from 'node:path';
import { migrate } from './migrate.mjs';
const url = process.env.XATA_WRITE_POSTGRES_URL || process.env.XATA_POSTGRES_URL;
if (!url) throw new Error('XATA_WRITE_POSTGRES_URL or XATA_POSTGRES_URL is required');
const pool = new pg.Pool({connectionString: url, max: 1});
try { console.log(`${await migrate(pool, resolve(process.argv[2] || 'drizzle'))} migration(s) applied`); }
catch (error) { console.error(error.message, error.cause?.message || ''); process.exitCode = 1; }
finally { await pool.end(); }
