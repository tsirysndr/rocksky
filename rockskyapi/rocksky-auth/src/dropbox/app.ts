import { Hono } from "hono";
import { env } from "lib/env";

const app = new Hono();

app.get("/login", async (c) => {
  const clientId = env.DROPBOX_CLIENT_ID;
  const redirectUri = `https://www.dropbox.com/oauth2/authorize?client_id=${clientId}&redirect_uri=${env.DROPBOX_REDIRECT_URI}&response_type=code&token_access_type=offline`;
  return c.json({ redirectUri });
});

app.get("/oauth/callback", async (c) => {
  const params = new URLSearchParams(c.req.url.split("?")[1]);
  const entries = Object.fromEntries(params.entries());
  return c.json(entries);
});

export default app;
