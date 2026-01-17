import { configure, getConsoleSink, getLogger } from "@logtape/logtape";

await configure({
  sinks: { console: getConsoleSink() },
  loggers: [
    {
      category: ["logtape", "meta"],
      lowestLevel: "warning",
      sinks: ["console"],
    },
    { category: "tap", lowestLevel: "debug", sinks: ["console"] },
  ],
});

const logger = getLogger("tap");

export default logger;
