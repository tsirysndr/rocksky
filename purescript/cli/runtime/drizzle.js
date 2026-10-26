import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import envpaths from "env-paths";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
fs.mkdirSync(envpaths("rocksky", { suffix: "" }).data, { recursive: true });
const url = `${envpaths("rocksky", { suffix: "" }).data}/rocksky.sqlite`;
const sqlite = new Database(url);
const db = drizzle(sqlite);
let initialized = false;
async function initializeDatabase() {
  if (initialized) {
    return;
  }
  try {
    let migrationsFolder = path.join(__dirname, "../drizzle");
    if (!fs.existsSync(migrationsFolder)) {
      migrationsFolder = path.join(__dirname, "../../drizzle");
    }
    if (fs.existsSync(migrationsFolder)) {
      migrate(db, { migrationsFolder });
      initialized = true;
    } else {
      initialized = true;
    }
  } catch (error) {
    console.error("Failed to run migrations:", error);
    throw error;
  }
}
var stdin_default = { db, initializeDatabase };
export {
  stdin_default as default,
  initializeDatabase
};
