import { configure, getConsoleSink, getLogger } from "@logtape/logtape";

await configure({
  sinks: { console: getConsoleSink() },
  loggers: [
    { category: "@rocksky/cli", lowestLevel: "debug", sinks: ["console"] },
  ],
});

export const logger = getLogger("@rocksky/cli");
