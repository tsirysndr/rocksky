import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Share the original API's migration history and default Drizzle journal table.
// Paths are relative to this package, where `bun run db:migrate` executes.
export default defineConfig({
  dialect: "postgresql",
  out: "../apps/api/drizzle",
  dbCredentials: {
    url: process.env.XATA_WRITE_POSTGRES_URL || process.env.XATA_POSTGRES_URL,
  },
});
