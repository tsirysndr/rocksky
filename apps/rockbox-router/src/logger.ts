import { createConsola } from "consola";

export const logger = createConsola({
  level: Number(process.env.LOG_LEVEL ?? 4),
  formatOptions: {
    date: true,
    colors: process.stdout.isTTY ?? false,
  },
}).withTag("rockbox-router");
