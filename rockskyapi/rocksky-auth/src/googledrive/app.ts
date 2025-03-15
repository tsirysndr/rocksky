import { equals } from "@xata.io/client";
import axios from "axios";
import { ctx } from "context";
import fs from "fs";
import { google } from "googleapis";
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
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/drive"],
    state: user.xata_id,
  });
  return c.json({ authUrl });
});

app.get("/oauth/callback", async (c) => {
  const params = new URLSearchParams(c.req.url.split("?")[1]);
  const entries = Object.fromEntries(params.entries());

  const credentials = JSON.parse(
    fs.readFileSync("credentials.json").toString("utf-8")
  );
  const { client_id, client_secret } = credentials.installed || credentials.web;

  const response = await axios.postForm("https://oauth2.googleapis.com/token", {
    code: entries.code,
    client_id,
    client_secret,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    grant_type: "authorization_code",
  });

  const googledrive = await ctx.client.db.google_drive
    .select(["*", "user_id.*", "google_drive_token_id.*"])
    .filter("user_id.xata_id", equals(entries.state))
    .getFirst();

  if (googledrive) {
    await ctx.client.db.google_drive_tokens.delete(
      googledrive.google_drive_token_id.xata_id
    );
  }

  const newGoogleDriveToken = await ctx.client.db.google_drive_tokens.create({
    refresh_token: encrypt(
      response.data.refresh_token,
      env.SPOTIFY_ENCRYPTION_KEY
    ),
  });

  await ctx.client.db.google_drive.create({
    google_drive_token_id: newGoogleDriveToken.xata_id,
    user_id: entries.state,
  });

  return c.redirect(`${env.FRONTEND_URL}/googledrive`);
});

export default app;
