// postinstall: fetch the platform binary up front so the first `rocksky mcp`
// run doesn't pause for a download. A failure here (offline CI, firewalled
// registry mirror…) is a warning, not an install failure — the CLI and the bin
// shim both retry the download on first run.

"use strict";

const { ensureBinary } = require("./lib/download");

ensureBinary().catch((err) => {
  console.warn(`rocksky-mcp: could not fetch the binary now (${err.message})`);
  console.warn("rocksky-mcp: it will be downloaded on first run instead");
});
