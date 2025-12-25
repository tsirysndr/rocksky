import drizzle from "./drizzle.ts";
import axios from "axios";

export const ctx = {
  db: drizzle.db,
  analytics: axios.create({ baseURL: Deno.env.get("ANALYTICS_URL") }),
};

export type Context = typeof ctx;
