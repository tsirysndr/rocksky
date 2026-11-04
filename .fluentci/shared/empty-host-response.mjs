import { readFileSync } from "node:fs";

// SDK commit 954d035 assumes every string-returning host call allocates memory.
// Extism represents empty strings as offset 0. Accept that successful response
// without masking missing imports, nonzero offsets, or execution failures.
export const emptyHostResponse = {
  name: "fluentci-empty-host-response",
  setup(build) {
    build.onLoad({ filter: /FluentCI\.Plugin\.Internal\.Imports\/foreign\.js$/ }, ({ path }) => {
      const source = readFileSync(path, "utf8");
      const original = 'return signature.output ? Memory.find(result).readString() : "";';
      if (!source.includes(original)) throw Error("FluentCI SDK transport changed; review the empty-response compatibility fix");
      return {
        contents: source.replace(original, 'return signature.output && result !== 0 && result !== 0n ? Memory.find(result).readString() : "";'),
        loader: "js",
      };
    });
  },
};
