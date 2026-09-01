// postinstall: fetch the platform binary up front so the first `playerd` run
// doesn't pause for a download. A failure here (offline CI, firewalled
// registry mirror…) is a warning, not an install failure — the bin shim
// retries the download on first run.

"use strict";

const { ensureBinary } = require("./lib/download");

ensureBinary().catch((err) => {
  console.warn(`playerd: could not fetch the binary now (${err.message})`);
  console.warn("playerd: it will be downloaded on first run instead");
});
