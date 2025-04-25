import { rockskyMcpServer } from "mcp";

export function mcp() {
  rockskyMcpServer.run().catch((error) => {
    console.error("Failed to run Rocksky MCP server", { error });
    process.exit(1);
  });
}
