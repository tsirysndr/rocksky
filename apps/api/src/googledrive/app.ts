import axios from "axios";
import { ctx } from "context";
import { eq } from "drizzle-orm";
import fs from "fs";
import { google } from "googleapis";
import { Hono } from "hono";
import jwt from "jsonwebtoken";
import { encrypt } from "lib/crypto";
import { env } from "lib/env";
import { requestCounter } from "metrics";
import googleDriveAccounts from "schema/google-drive-accounts";
import googleDriveTokens from "schema/google-drive-tokens";
import googleDrive from "schema/googledrive";
import users from "schema/users";
import { emailSchema } from "types/email";

const app = new Hono();

app.get("/login", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/googledrive/login" });
  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  if (!bearer || bearer === "null") {
    c.status(401);
    return c.text("Unauthorized");
  }

  const { did } = jwt.verify(bearer, env.JWT_SECRET, {
    ignoreExpiration: true,
  });

  const user = await ctx.db
    .select()
    .from(users)
    .where(eq(users.did, did))
    .limit(1)
    .then((rows) => rows[0]);

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
    state: user.id,
  });
  return c.json({ authUrl });
});

app.get("/oauth/callback", async (c) => {
  requestCounter.add(1, {
    method: "GET",
    route: "/googledrive/oauth/callback",
  });
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

  const existingGoogleDrive = await ctx.db
    .select({
      googleDrive: googleDrive,
      user: users,
      token: googleDriveTokens,
    })
    .from(googleDrive)
    .innerJoin(users, eq(googleDrive.userId, users.id))
    .leftJoin(
      googleDriveTokens,
      eq(googleDrive.googleDriveTokenId, googleDriveTokens.id)
    )
    .where(eq(users.id, entries.state))
    .limit(1)
    .then((rows) => rows[0]);

  let tokenId: string;
  if (existingGoogleDrive?.token) {
    const [updatedToken] = await ctx.db
      .update(googleDriveTokens)
      .set({
        refreshToken: encrypt(
          response.data.refresh_token,
          env.SPOTIFY_ENCRYPTION_KEY
        ),
      })
      .where(eq(googleDriveTokens.id, existingGoogleDrive.token.id))
      .returning();
    tokenId = updatedToken.id;
  } else {
    const [newToken] = await ctx.db
      .insert(googleDriveTokens)
      .values({
        refreshToken: encrypt(
          response.data.refresh_token,
          env.SPOTIFY_ENCRYPTION_KEY
        ),
      })
      .returning();
    tokenId = newToken.id;
  }

  if (existingGoogleDrive?.googleDrive) {
    await ctx.db
      .update(googleDrive)
      .set({
        googleDriveTokenId: tokenId,
        userId: entries.state,
      })
      .where(eq(googleDrive.id, existingGoogleDrive.googleDrive.id));
  } else {
    await ctx.db.insert(googleDrive).values({
      googleDriveTokenId: tokenId,
      userId: entries.state,
    });
  }

  return c.redirect(`${env.FRONTEND_URL}/googledrive`);
});

app.post("/join", async (c) => {
  requestCounter.add(1, { method: "POST", route: "/googledrive/join" });
  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  if (!bearer || bearer === "null") {
    c.status(401);
    return c.text("Unauthorized");
  }

  const { did } = jwt.verify(bearer, env.JWT_SECRET, {
    ignoreExpiration: true,
  });

  const user = await ctx.db
    .select()
    .from(users)
    .where(eq(users.did, did))
    .limit(1)
    .then((rows) => rows[0]);

  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const body = await c.req.json();
  const parsed = emailSchema.safeParse(body);

  if (parsed.error) {
    c.status(400);
    return c.text("Invalid email: " + parsed.error.message);
  }

  const { email } = parsed.data;

  try {
    await ctx.db.insert(googleDriveAccounts).values({
      userId: user.id,
      email,
      isBetaUser: false,
    });
  } catch (e) {
    if (!e.message.includes("duplicate key value violates unique constraint")) {
      console.error(e.message);
    } else {
      throw e;
    }
  }

  await fetch("https://beta.rocksky.app", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.ROCKSKY_BETA_TOKEN}`,
    },
    body: JSON.stringify({ email }),
  });

  return c.json({ status: "ok" });
});

app.get("/files", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/googledrive/files" });
  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  if (!bearer || bearer === "null") {
    c.status(401);
    return c.text("Unauthorized");
  }

  const { did } = jwt.verify(bearer, env.JWT_SECRET, {
    ignoreExpiration: true,
  });

  const user = await ctx.db
    .select()
    .from(users)
    .where(eq(users.did, did))
    .limit(1)
    .then((rows) => rows[0]);

  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const parent_id = c.req.query("parent_id");

  try {
    if (parent_id) {
      const { data } = await ctx.googledrive.post(
        "googledrive.getFilesInParents",
        {
          did,
          parent_id,
        }
      );
      return c.json(data);
    }

    let response = await ctx.googledrive.post("googledrive.getMusicDirectory", {
      did,
    });

    if (response.data.files.length === 0) {
      await ctx.googledrive.post("googledrive.createMusicDirectory", { did });
      response = await ctx.googledrive.post("googledrive.getMusicDirectory", {
        did,
      });
    }

    const { data } = await ctx.googledrive.post(
      "googledrive.getFilesInParents",
      {
        did,
        parent_id: response.data.files[0].id,
      }
    );
    return c.json(data);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error("Axios error:", error.response?.data || error.message);

      const credentials = JSON.parse(
        fs.readFileSync("credentials.json").toString("utf-8")
      );
      const { client_id, client_secret } =
        credentials.installed || credentials.web;
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
        state: user.id,
      });

      return c.json({
        error: "Failed to fetch files",
        authUrl,
      });
    }
  }
});

app.get("/files/:id", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/googledrive/files/:id" });
  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  if (!bearer || bearer === "null") {
    c.status(401);
    return c.text("Unauthorized");
  }

  const { did } = jwt.verify(bearer, env.JWT_SECRET, {
    ignoreExpiration: true,
  });

  const user = await ctx.db
    .select()
    .from(users)
    .where(eq(users.did, did))
    .limit(1)
    .then((rows) => rows[0]);

  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const id = c.req.param("id");
  const response = await ctx.googledrive.post("googledrive.getFile", {
    did,
    file_id: id,
  });

  return c.json(response.data);
});

app.get("/files/:id/download", async (c) => {
  requestCounter.add(1, {
    method: "GET",
    route: "/googledrive/files/:id/download",
  });
  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  if (!bearer || bearer === "null") {
    c.status(401);
    return c.text("Unauthorized");
  }

  const { did } = jwt.verify(bearer, env.JWT_SECRET, {
    ignoreExpiration: true,
  });

  const user = await ctx.db
    .select()
    .from(users)
    .where(eq(users.did, did))
    .limit(1)
    .then((rows) => rows[0]);

  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const id = c.req.param("id");
  const response = await ctx.googledrive.post("googledrive.downloadFile", {
    did,
    file_id: id,
  });

  c.header(
    "Content-Type",
    response.headers["content-type"] || "application/octet-stream"
  );
  c.header(
    "Content-Disposition",
    response.headers["content-disposition"] || "attachment"
  );

  return new Response(response.data, {
    headers: c.res.headers,
  });
});

export default app;
