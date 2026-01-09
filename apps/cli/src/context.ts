import { logger } from "logger";
import drizzle from "./drizzle";

export const ctx = {
  db: drizzle.db,
  logger,
};

export type Context = typeof ctx;
