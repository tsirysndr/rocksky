import { ansiColorFormatter, configure, defaultTextFormatter, getConsoleSink, getLogger } from "@logtape/logtape";
import chalk from "chalk";

// Use terminal escape sequences, not browser CSS console formatting: Node and
// Bun render interpolated console values differently with the default sink.
const formatter = !("NO_COLOR" in process.env) && chalk.level > 0
  ? ansiColorFormatter
  : defaultTextFormatter;
await configure({
  sinks: {
    console: getConsoleSink({ formatter }),
    meta: getConsoleSink({ formatter })
  },
  loggers: [
    { category: "@rocksky/cli", lowestLevel: "debug", sinks: ["console"] },
    {
      category: ["logtape", "meta"],
      lowestLevel: "warning",
      sinks: ["meta"]
    }
  ]
});
const logger = getLogger("@rocksky/cli");
export {
  logger
};
