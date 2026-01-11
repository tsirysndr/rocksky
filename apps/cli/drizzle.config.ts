import { defineConfig } from "drizzle-kit";
import envpaths from "env-paths";
import fs from "node:fs";
import chalk from "chalk";

fs.mkdirSync(envpaths("rocksky", { suffix: "" }).data, { recursive: true });
const url = `${envpaths("rocksky", { suffix: "" }).data}/rocksky.sqlite`;

console.log(`Database URL: ${chalk.greenBright(url)}`);

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema",
  out: "./drizzle",
  dbCredentials: {
    url,
  },
});
