import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema",
  dbCredentials: {
    url: Deno.env.get("XATA_WRITE_POSTGRES_URL") || Deno.env.get("XATA_POSTGRES_URL")!,
  },
});
