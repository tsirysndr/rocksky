import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema",
  dbCredentials: {
    url: process.env.XATA_WRITE_POSTGRES_URL || process.env.XATA_POSTGRES_URL!,
  },
});
