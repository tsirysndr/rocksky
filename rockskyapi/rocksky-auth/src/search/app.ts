import { ctx } from "context";
import { Hono } from "hono";

const app = new Hono();

app.get("/", async (c) => {
  const query = c.req.query("q");
  const size = +c.req.query("size") || 10;
  const offset = +c.req.query("offset") || 0;

  if (!query) {
    return c.json([]);
  }

  const results = await ctx.client.search.all(query, {
    tables: [
      {
        table: "users",
        target: ["handle"],
      },
      {
        table: "albums",
        target: ["title"],
      },
      {
        table: "artists",
        target: ["name"],
      },
      {
        table: "tracks",
        target: ["title", "composer", "copyright_message"],
      },
      {
        table: "playlists",
        target: ["name"],
      },
    ],
    fuzziness: 1,
    prefix: "phrase",
    page: {
      size,
      offset,
    },
  });
  return c.json(results);
});

export default app;
