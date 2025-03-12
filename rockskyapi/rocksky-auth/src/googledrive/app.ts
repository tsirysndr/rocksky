import fs from "fs";
import { google } from "googleapis";
import { Hono } from "hono";
import { env } from "lib/env";

const app = new Hono();

app.get("/login", async (c) => {
  const credentials = JSON.parse(
    fs.readFileSync("credentials.json").toString("utf-8")
  );
  const { client_id, client_secret } = credentials.installed || credentials.web;
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    env.GOOGLE_REDIRECT_URI
  );

  // Generate Auth URL
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    // prompt: "consent",
    scope: ["https://www.googleapis.com/auth/drive"],
  });
  return c.json({ authUrl });
});

app.get("/oauth/callback", async (c) => {
  const params = new URLSearchParams(c.req.url.split("?")[1]);
  const entries = Object.fromEntries(params.entries());
  return c.json(entries);
});

export default app;
