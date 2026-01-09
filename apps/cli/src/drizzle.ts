import { drizzle } from "drizzle-orm/better-sqlite3";
import envpaths from "env-paths";
import fs from "node:fs";

fs.mkdirSync(envpaths("rocksky", { suffix: "" }).data, { recursive: true });
const url = `${envpaths("rocksky", { suffix: "" }).data}/rocksky.sqlite`;

const db = drizzle(url);

export default { db };
