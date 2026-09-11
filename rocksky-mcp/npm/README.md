# @rocksky/mcp

The [Model Context Protocol](https://modelcontextprotocol.io) server for
[Rocksky](https://rocksky.app), as a native binary. It gives an AI agent the
listener's players (the real ones — playerd daemons, the desktop app, web
miniplayers), their music library, and their Rocksky account.

Most people never install this directly: it ships with the Rocksky CLI, and
`rocksky mcp` runs it.

```sh
npm install -g @rocksky/cli
rocksky login
rocksky mcp          # stdio MCP server
```

Installing it on its own gives you the `rocksky-mcp` command:

```sh
npm install -g @rocksky/mcp
rocksky-mcp
```

The install fetches the prebuilt binary for your platform from the matching
[GitHub release](https://github.com/tsirysndr/rocksky/releases) and verifies its
SHA-256. Supported: macOS arm64/x64, Linux x64/arm64, Windows x64. If install
scripts were skipped (`--ignore-scripts`), the binary is downloaded on first run
instead.

Point an MCP client at it:

```json
{
  "mcpServers": {
    "rocksky": { "command": "rocksky", "args": ["mcp"] }
  }
}
```

Full documentation — every tool, configuration, what it can and cannot do —
lives at
[rocksky-mcp](https://github.com/tsirysndr/rocksky/tree/main/rocksky-mcp#readme).
