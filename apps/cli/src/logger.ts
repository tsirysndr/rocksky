import { configure, getConsoleSink, getLogger } from "@logtape/logtape";

await configure({
  sinks: {
    console: getConsoleSink(),
    meta: getConsoleSink(),
  },
  loggers: [
    { category: "@rocksky/cli", lowestLevel: "debug", sinks: ["console"] },
    {
      category: ["logtape", "meta"],
      lowestLevel: "warning",
      sinks: ["meta"],
    },
  ],
});

export const logger = getLogger("@rocksky/cli");
