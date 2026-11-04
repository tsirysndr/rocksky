import { installHost } from "./pdk-host.mjs";
installHost();
const { main } = await import("../main/output/Rocksky.CI.Test.Docker/index.js");
main();
console.log("Docker integration checks passed: snapshots, argv/stdin, symlinks, source ownership, Git staging, Redis, and PostgreSQL isolation.");
