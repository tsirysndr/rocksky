import { equals } from "@xata.io/client";
import axios from "axios";
import { ctx } from "context";
import { Hono } from "hono";
import jwt from "jsonwebtoken";
import { encrypt } from "lib/crypto";
import { env } from "lib/env";

const app = new Hono();

app.get("/login", async (c) => {
  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  if (!bearer || bearer === "null") {
    c.status(401);
    return c.text("Unauthorized");
  }

  const { did } = jwt.verify(bearer, env.JWT_SECRET);

  const user = await ctx.client.db.users.filter("did", equals(did)).getFirst();
  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const clientId = env.DROPBOX_CLIENT_ID;
  const redirectUri = `https://www.dropbox.com/oauth2/authorize?client_id=${clientId}&redirect_uri=${env.DROPBOX_REDIRECT_URI}&response_type=code&token_access_type=offline&state=${user.xata_id}`;
  return c.json({ redirectUri });
});

app.get("/oauth/callback", async (c) => {
  const params = new URLSearchParams(c.req.url.split("?")[1]);
  const entries = Object.fromEntries(params.entries());
  // entries.code
  const response = await axios.postForm(
    "https://api.dropboxapi.com/oauth2/token",
    {
      code: entries.code,
      grant_type: "authorization_code",
      client_id: env.DROPBOX_CLIENT_ID,
      client_secret: env.DROPBOX_CLIENT_SECRET,
      redirect_uri: env.DROPBOX_REDIRECT_URI,
    }
  );

  const dropbox = await ctx.client.db.dropbox
    .select(["*", "user_id.*", "dropbox_token_id.*"])
    .filter("user_id.xata_id", equals(entries.state))
    .getFirst();

  if (dropbox) {
    await ctx.client.db.dropbox_tokens.delete(dropbox.dropbox_token_id.xata_id);
  }

  const newDropboxToken = await ctx.client.db.dropbox_tokens.create({
    refresh_token: encrypt(
      response.data.refresh_token,
      env.SPOTIFY_ENCRYPTION_KEY
    ),
  });

  await ctx.client.db.dropbox.create({
    dropbox_token_id: newDropboxToken.xata_id,
    user_id: entries.state,
  });

  return c.redirect(`${env.FRONTEND_URL}/dropbox`);
});

export default app;
