import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { RockskyClient } from "client";
import { z } from "zod";
import { albums } from "./tools/albums";
import { artists } from "./tools/artists";
import { createApiKey } from "./tools/create";
import { myscrobbles } from "./tools/myscrobbles";
import { nowplaying } from "./tools/nowplaying";
import { scrobbles } from "./tools/scrobbles";
import { search } from "./tools/search";
import { stats } from "./tools/stats";
import { tracks } from "./tools/tracks";
import { whoami } from "./tools/whoami";

class RockskyMcpServer {
  private readonly server: McpServer;
  private readonly client: RockskyClient;

  constructor() {
    this.server = new McpServer({
      name: "rocksky-mcp",
      version: "0.1.0",
    });
    const client = new RockskyClient();
    this.setupTools();
  }

  private setupTools() {
    this.server.tool("whoami", "get the current logged-in user.", async () => {
      return {
        content: [
          {
            type: "text",
            text: await whoami(),
          },
        ],
      };
    });

    this.server.tool(
      "nowplaying",
      "get the currently playing track.",
      {
        did: z
          .string()
          .optional()
          .describe(
            "the DID or handle of the user to get the now playing track for."
          ),
      },
      async ({ did }) => {
        return {
          content: [
            {
              type: "text",
              text: await nowplaying(did),
            },
          ],
        };
      }
    );

    this.server.tool(
      "scrobbles",
      "display recently played tracks (recent scrobbles).",
      {
        did: z
          .string()
          .optional()
          .describe("the DID or handle of the user to get the scrobbles for."),
        skip: z.number().optional().describe("number of scrobbles to skip"),
        limit: z.number().optional().describe("number of scrobbles to limit"),
      },
      async ({ did, skip = 0, limit = 10 }) => {
        return {
          content: [
            {
              type: "text",
              text: await scrobbles(did, { skip, limit }),
            },
          ],
        };
      }
    );

    this.server.tool(
      "my-scrobbles",
      "display my recently played tracks (recent scrobbles).",
      {
        skip: z.number().optional().describe("number of scrobbles to skip"),
        limit: z.number().optional().describe("number of scrobbles to limit"),
      },
      async ({ skip = 0, limit = 10 }) => {
        return {
          content: [
            {
              type: "text",
              text: await myscrobbles({ skip, limit }),
            },
          ],
        };
      }
    );

    this.server.tool(
      "search",
      "search for tracks, artists, albums or users.",
      {
        query: z
          .string()
          .describe("the search query, e.g., artist, album, title or account"),
        limit: z.number().optional().describe("number of results to limit"),
        albums: z.boolean().optional().describe("search for albums"),
        tracks: z.boolean().optional().describe("search for tracks"),
        users: z.boolean().optional().describe("search for users"),
        artists: z.boolean().optional().describe("search for artists"),
      },
      async ({
        query,
        limit = 10,
        albums = false,
        tracks = false,
        users = false,
        artists = false,
      }) => {
        return {
          content: [
            {
              type: "text",
              text: await search(query, {
                limit,
                albums,
                tracks,
                users,
                artists,
              }),
            },
          ],
        };
      }
    );

    this.server.tool(
      "artists",
      "get the user's top artists or current user's artists if no did is provided.",
      {
        did: z
          .string()
          .optional()
          .describe("the DID or handle of the user to get artists for."),

        limit: z.number().optional().describe("number of results to limit"),
      },
      async ({ did, limit }) => {
        return {
          content: [
            {
              type: "text",
              text: await artists(did, { skip: 0, limit }),
            },
          ],
        };
      }
    );

    this.server.tool(
      "albums",
      "get the user's top albums or current user's albums if no did is provided.",
      {
        did: z
          .string()
          .optional()
          .describe("the DID or handle of the user to get albums for."),
        limit: z.number().optional().describe("number of results to limit"),
      },
      async ({ did, limit }) => {
        return {
          content: [
            {
              type: "text",
              text: await albums(did, { skip: 0, limit }),
            },
          ],
        };
      }
    );

    this.server.tool(
      "tracks",
      "get the user's top tracks or current user's tracks if no did is provided.",
      {
        did: z
          .string()
          .optional()
          .describe("the DID or handle of the user to get tracks for."),
        limit: z.number().optional().describe("number of results to limit"),
      },
      async ({ did, limit }) => {
        return {
          content: [
            {
              type: "text",
              text: await tracks(did, { skip: 0, limit }),
            },
          ],
        };
      }
    );

    this.server.tool(
      "stats",
      "get the user's listening stats or current user's stats if no did is provided.",
      {
        did: z
          .string()
          .optional()
          .describe("the DID or handle of the user to get stats for."),
      },
      async ({ did }) => {
        return {
          content: [
            {
              type: "text",
              text: await stats(did),
            },
          ],
        };
      }
    );

    this.server.tool(
      "create-apikey",
      "create an API key.",
      {
        name: z.string().describe("the name of the API key"),
        description: z
          .string()
          .optional()
          .describe("the description of the API key"),
      },
      async ({ name, description }) => {
        return {
          content: [
            {
              type: "text",
              text: await createApiKey(name, { description }),
            },
          ],
        };
      }
    );
  }

  async run() {
    const stdioTransport = new StdioServerTransport();
    try {
      await this.server.connect(stdioTransport);
    } catch (error) {
      process.exit(1);
    }
  }

  public getServer(): McpServer {
    return this.server;
  }
}

export const rockskyMcpServer = new RockskyMcpServer();
